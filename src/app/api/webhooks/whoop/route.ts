import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";

import { env } from "~/env";
import { syncWhoopRecent } from "~/server/sync-all";

export const maxDuration = 300;

/**
 * WHOOP's notification on a new or re-scored sleep, recovery or workout.
 *
 * Like Pocket's, a DOORBELL: the body only says something changed, and the
 * recent window is pulled back over the API. Signed with the client secret:
 * base64(HMAC-SHA256(timestamp + raw body)).
 */
export async function POST(request: Request) {
  const body = await request.text();
  const timestamp = request.headers.get("x-whoop-signature-timestamp") ?? "";
  const signature = request.headers.get("x-whoop-signature") ?? "";
  const expected = createHmac("sha256", env.WHOOP_CLIENT_SECRET ?? "")
    .update(timestamp + body)
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (!env.WHOOP_CLIENT_SECRET || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  // WHOOP waits a few seconds at most; the pull runs after the answer.
  after(syncWhoopRecent);
  return NextResponse.json({ success: true });
}
