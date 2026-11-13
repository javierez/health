import { AsyncLocalStorage } from "node:async_hooks";

import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * One client per process. Next's dev server reloads modules, so it is cached on
 * globalThis — without that every save leaks a pool and Supabase runs out of
 * connections after twenty edits.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

// Supabase's session pooler lets 15 clients in, for every function at once,
// and Vercel freezes a function as soon as its response is out: a frozen
// function never runs postgres.js's idle timer, so its connections stayed
// taken and the panel failed with EMAXCONNSESSION (18 and 19-oct-2026). Every
// query keeps the function awake until they are let go, which is what
// Vercel's attachDatabasePool does for `pg` (it doesn't take postgres.js).
// The transaction pooler (6543) is no way out: it hangs on two queries at once.
const IDLE_S = 5;
const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, { prepare: false, max: 4, idle_timeout: IDLE_S });
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

function stayAwake() {
  try {
    after(() => new Promise((done) => setTimeout(done, IDLE_S * 1000 + 100)));
  } catch {
    // Outside a request (a script): nothing to keep awake.
  }
}

/**
 * 🚨 Everyone's rows, as `postgres`. Only for what comes before knowing who
 * is asking: the login (better-auth), the reset codes and finding the owner.
 */
export const adminDb = drizzle(conn, { schema, logger: { logQuery: stayAwake } });

/**
 * Who the queries run for. Several people use the app since 13-nov-2026, and
 * each one's rows carry their `user_id`. The rule lives in Postgres
 * (`drizzle/202611131800_multi_usuario.sql`): every query of `db` runs as
 * `pulso_user` with `app.user_id` set, and that role only sees the rows of
 * that id. A query that forgets its user gets nothing, never someone else's.
 *
 * The user is, in order: the one pinned by `asUser` (the tick, the webhooks),
 * the one signed in on this request, or, in a script on the Mac, the owner.
 */
const pinned = new AsyncLocalStorage<string>();
const bySession = new WeakMap<Headers, Promise<string | null>>();

export function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return pinned.run(userId, fn);
}

/** The first account: his, the one the Pocket, WHOOP, WhatsApp and GitHub keys belong to. */
let owner: Promise<string> | undefined;
export function ownerId(): Promise<string> {
  owner ??= adminDb
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .orderBy(asc(schema.authUser.createdAt))
    .limit(1)
    .then(([row]) => {
      if (!row) throw new Error("No hay ningún usuario: crea uno con scripts/crear-usuario.ts");
      return row.id;
    });
  owner.catch(() => (owner = undefined));
  return owner;
}

/** For his sources and his phone: the sync, the webhooks, the WhatsApp chat. */
export async function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  return asUser(await ownerId(), fn);
}

export async function currentUserId(): Promise<string | null> {
  const id = pinned.getStore();
  if (id) return id;
  if (!process.env.NEXT_RUNTIME) return ownerId();
  let h: Headers;
  try {
    h = await headers();
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
  let found = bySession.get(h);
  if (!found) {
    found = import("~/lib/auth").then(({ auth }) => auth.api.getSession({ headers: h })).then((s) => s?.user.id ?? null);
    bySession.set(h, found);
  }
  return found;
}

export async function isOwner(): Promise<boolean> {
  return (await currentUserId()) === (await ownerId());
}

/**
 * A job for later (`after`), still in the name of whoever asked: a page's
 * `after` cannot read the request, so the user is read now.
 */
export function asMeLater(job: () => Promise<unknown>): () => Promise<unknown> {
  const me = currentUserId().catch(() => null);
  return async () => {
    const id = await me;
    return id ? asUser(id, job) : undefined;
  };
}

/**
 * The client `db` hands to drizzle: each query, and each transaction, in its
 * own transaction that first becomes `pulso_user` for the current user.
 * Drizzle only calls `unsafe`, `unsafe().values()`, `begin` and `options`
 * (drizzle-orm/postgres-js/session.js, 0.42).
 */
function scoped(sql: postgres.Sql): postgres.Sql {
  const inScope = async <T>(run: (tx: postgres.TransactionSql) => Promise<T> | T): Promise<T> => {
    const userId = (await currentUserId()) ?? "";
    return sql.begin(async (tx) => {
      // Awaited before anything else: in a Promise.all, a transaction's first query can reach Postgres first, as `postgres`.
      await tx`select set_config('role', 'pulso_user', true), set_config('app.user_id', ${userId}, true)`;
      return run(tx);
    }) as Promise<T>;
  };
  const client = {
    options: sql.options,
    unsafe: (query: string, params?: unknown[]) => ({
      values: () => inScope((tx) => tx.unsafe(query, params as never[]).values()),
      then: (ok?: (rows: unknown) => unknown, ko?: (err: unknown) => unknown) =>
        inScope((tx) => tx.unsafe(query, params as never[])).then(ok, ko),
    }),
    begin: (fn: (tx: postgres.TransactionSql) => unknown) => inScope(fn),
  };
  return client as unknown as postgres.Sql;
}

export const db = drizzle(scoped(conn), { schema, logger: { logQuery: stayAwake } });
