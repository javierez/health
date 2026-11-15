import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "~/env";

/**
 * The session's own page, open without his login (Javier, 14-nov-2026: «una
 * URL al acabar»): `/e/2026-11-14-k3f9Qa…`. The day plus its signature, so
 * nobody reaches another day by changing the date, and nothing to store.
 */
const SIG_CHARS = 16;

const sign = (day: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`entreno:${day}`).digest("base64url").slice(0, SIG_CHARS);

export const tokenFor = (day: string) => `${day}-${sign(day)}`;

export function linkFor(day: string): string {
  return `${env.APP_URL ?? ""}/e/${tokenFor(day)}`;
}

/** The day it opens, or null if the signature is not ours. */
export function dayOf(token: string): string | null {
  const m = /^(\d{4}-\d\d-\d\d)-([\w-]+)$/.exec(token);
  if (!m) return null;
  const want = Buffer.from(sign(m[1]!));
  const got = Buffer.from(m[2]!);
  return got.length === want.length && timingSafeEqual(got, want) ? m[1]! : null;
}
