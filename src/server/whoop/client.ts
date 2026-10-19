import { eq, sql } from "drizzle-orm";

import { db } from "~/db";
import { oauthTokens } from "~/db/schema";
import { env } from "~/env";

/**
 * WHOOP v2. Everything here is read-only against the athlete's own data.
 *
 * 🚨 Two things about this API that are not obvious and cost an evening each:
 *
 * 1. **Refresh tokens rotate.** Every `/oauth/oauth2/token` refresh returns a
 *    NEW refresh token and kills the one you sent. Persist the response before
 *    doing anything else with it, or the next sync is locked out.
 * 2. **`offline` is a scope, not a flag.** Without it in the authorize URL
 *    WHOOP returns no refresh token at all, and the connection dies in two
 *    hours with a 401 that says nothing about why.
 *
 * Like the Pocket client, nothing here throws: a failed sync must not take the
 * process down.
 */
const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer";

/** `offline` first — it is the one whose absence is silent. */
export const SCOPES = [
  "offline",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:profile",
  "read:body_measurement",
] as const;

export type WhoopResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** WHOOP requires the state parameter to be at least 8 characters. */
export function authorizeUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.WHOOP_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", env.WHOOP_REDIRECT_URI ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function postToken(body: Record<string, string>): Promise<WhoopResult<TokenResponse>> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.WHOOP_CLIENT_ID ?? "",
        client_secret: env.WHOOP_CLIENT_SECRET ?? "",
        ...body,
      }),
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network error" };
  }
  if (!res.ok) return { ok: false, reason: `token ${res.status}: ${await res.text()}` };
  return { ok: true, data: (await res.json()) as TokenResponse };
}

async function persist(token: TokenResponse): Promise<void> {
  const row = {
    provider: "whoop",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    scope: token.scope ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(oauthTokens)
    .values(row)
    .onConflictDoUpdate({ target: oauthTokens.provider, set: row });
}

/** Step 6 of the flow: the one-time code becomes a stored grant. */
export async function exchangeCode(code: string): Promise<WhoopResult<null>> {
  const res = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.WHOOP_REDIRECT_URI ?? "",
  });
  if (!res.ok) return res;
  await persist(res.data);
  return { ok: true, data: null };
}

/** Refreshed a minute early, because a token that expires mid-sweep is a 401. */
const EXPIRY_MARGIN_MS = 60_000;

async function accessToken(): Promise<WhoopResult<string>> {
  const row = await readToken();
  if (!row) return { ok: false, reason: "not connected — visit /api/whoop/oauth" };
  if (row.expiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now()) {
    return { ok: true, data: row.accessToken };
  }

  // 🚨 One refresh at a time. The tick, a webhook and an open board can all
  // sync at once, and refresh tokens rotate: the second refresh would send a
  // token the first one already killed, and the grant is gone until someone
  // re-authorises by hand. The lock serialises them; whoever waited reads the
  // token the winner stored.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whoop-refresh'))`);
    const fresh = await readToken();
    if (!fresh) return { ok: false as const, reason: "not connected — visit /api/whoop/oauth" };
    if (fresh.expiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now()) {
      return { ok: true as const, data: fresh.accessToken };
    }
    if (!fresh.refreshToken) {
      return { ok: false as const, reason: "expired and no refresh token — reconnect with the offline scope" };
    }
    const res = await postToken({
      grant_type: "refresh_token",
      refresh_token: fresh.refreshToken,
      scope: "offline",
    });
    if (!res.ok) return res;
    await persist(res.data);
    return { ok: true as const, data: res.data.access_token };
  });
}

async function readToken() {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "whoop"))
    .limit(1);
  return row ?? null;
}

/** A single object, not a collection: the profile, the body measurements. */
export async function fetchOne<T>(path: string): Promise<WhoopResult<T>> {
  const token = await accessToken();
  if (!token.ok) return token;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token.data}` } });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network error" };
  }
  if (!res.ok) return { ok: false, reason: `${path} ${res.status}: ${await res.text()}` };
  return { ok: true, data: (await res.json()) as T };
}

export interface WhoopPage<T> {
  records: T[];
  next_token?: string | null;
}

/**
 * One collection, following `next_token` to the end. WHOOP pages at 25 by
 * default and caps at 25 for most collections, so a year of sleep is ~15 calls.
 */
export async function collect<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<WhoopResult<T[]>> {
  const token = await accessToken();
  if (!token.ok) return token;

  const out: T[] = [];
  let next: string | undefined;

  do {
    const url = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("limit", "25");
    if (next) url.searchParams.set("nextToken", next);

    let res: Response;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token.data}` } });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "network error" };
    }
    if (!res.ok) return { ok: false, reason: `${path} ${res.status}: ${await res.text()}` };

    const page = (await res.json()) as WhoopPage<T>;
    out.push(...page.records);
    next = page.next_token ?? undefined;
  } while (next);

  return { ok: true, data: out };
}
