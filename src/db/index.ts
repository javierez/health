import { drizzle } from "drizzle-orm/postgres-js";
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

export const db = drizzle(conn, { schema, logger: { logQuery: stayAwake } });
