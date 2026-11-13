import { eq } from "drizzle-orm";

import { db } from "~/db";
import { oauthTokens } from "~/db/schema";
import { env } from "~/env";
import type { Busy } from "~/server/commitments/standing";

/**
 * Google Calendar and Gmail, read-only: what his week looks like, so the
 * assistant knows when there is a gap for the gym and how loaded he is.
 *
 * 🚨 Unlike WHOOP, Google does NOT send a refresh token on a refresh, and only
 * sends one on the first consent unless `prompt=consent` is asked. So the
 * authorize URL always asks for consent, and a refresh keeps the stored
 * refresh token instead of overwriting it with nothing.
 *
 * Like the other clients, nothing here throws.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PROVIDER = "google";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export type GoogleResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

export function authorizeUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function postToken(body: Record<string, string>): Promise<GoogleResult<TokenResponse>> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
        ...body,
      }),
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network error" };
  }
  if (!res.ok) return { ok: false, reason: `token ${res.status}: ${await res.text()}` };
  return { ok: true, data: (await res.json()) as TokenResponse };
}

async function persist(token: TokenResponse, keepRefresh: string | null): Promise<void> {
  const row = {
    provider: PROVIDER,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? keepRefresh,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    scope: token.scope ?? null,
    updatedAt: new Date(),
  };
  await db.insert(oauthTokens).values(row).onConflictDoUpdate({ target: [oauthTokens.userId, oauthTokens.provider], set: row });
}

export async function exchangeCode(code: string): Promise<GoogleResult<null>> {
  const res = await postToken({ grant_type: "authorization_code", code, redirect_uri: env.GOOGLE_REDIRECT_URI ?? "" });
  if (!res.ok) return res;
  await persist(res.data, null);
  return { ok: true, data: null };
}

async function accessToken(): Promise<GoogleResult<string>> {
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER)).limit(1);
  if (!row) return { ok: false, reason: "not connected, visit /api/google/oauth" };
  if (row.expiresAt.getTime() - 60_000 > Date.now()) return { ok: true, data: row.accessToken };
  if (!row.refreshToken) return { ok: false, reason: "expired and no refresh token, reconnect" };
  // No lock, unlike WHOOP: the refresh token does not rotate, so two refreshes
  // at once both work and the second just overwrites the first.
  const res = await postToken({ grant_type: "refresh_token", refresh_token: row.refreshToken });
  if (!res.ok) return res;
  await persist(res.data, row.refreshToken);
  return { ok: true, data: res.data.access_token };
}

async function get<T>(url: string): Promise<GoogleResult<T>> {
  const token = await accessToken();
  if (!token.ok) return token;
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token.data}` } });
    if (!res.ok) return { ok: false, reason: `${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network error" };
  }
}

export interface Meeting extends Busy {
  title: string;
}

interface EventsResponse {
  items?: {
    summary?: string;
    status?: string;
    transparency?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    attendees?: { self?: boolean; responseStatus?: string }[];
  }[];
}

/**
 * What takes his time between two instants, from the primary calendar. Left
 * out: all-day events (a birthday is not a meeting), "free" events and the
 * ones he declined.
 */
export async function listMeetings(from: Date, to: Date): Promise<GoogleResult<Meeting[]>> {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  const res = await get<EventsResponse>(url.toString());
  if (!res.ok) return res;
  const meetings = (res.data.items ?? []).flatMap((e): Meeting[] => {
    if (e.status === "cancelled" || e.transparency === "transparent") return [];
    if (!e.start?.dateTime || !e.end?.dateTime) return [];
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) return [];
    return [{ title: e.summary ?? "(sin título)", start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) }];
  });
  return { ok: true, data: meetings };
}

/** Unread mail in the primary inbox: a rough "how much is waiting for him". */
export async function unreadCount(): Promise<GoogleResult<number>> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", "in:inbox is:unread category:primary newer_than:7d");
  url.searchParams.set("maxResults", "500");
  const res = await get<{ messages?: unknown[]; resultSizeEstimate?: number }>(url.toString());
  if (!res.ok) return res;
  return { ok: true, data: res.data.messages?.length ?? res.data.resultSizeEstimate ?? 0 };
}
