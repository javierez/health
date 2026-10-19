import { after, NextResponse } from "next/server";

import { env } from "~/env";
import { syncEverything } from "~/server/sync-all";

// A pass fetches, classifies and reads facts serially; it needs the full 300 s.
export const maxDuration = 300;

/**
 * The tick (pg_cron, every 10 min) and the daily Vercel cron. Pulls Pocket,
 * WHOOP and GitHub, then lets the assistant decide whether to write.
 *
 * Always behind a bearer: `SYNC_SECRET`, or `CRON_SECRET` from Vercel Cron.
 * The board's button is a server action now, so nothing calls this without
 * one — and an open sync endpoint is an open tap on the Anthropic bill.
 *
 * It answers at once and works in `after()`: pg_net gives up waiting after
 * ten seconds, and a pass takes minutes.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const allowed = [env.SYNC_SECRET, env.CRON_SECRET].filter(Boolean).map((s) => `Bearer ${s}`);
  if (!auth || !allowed.includes(auth)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  after(async () => {
    const report = await syncEverything();
    console.log("sync", JSON.stringify(report).slice(0, 2000));
  });
  return NextResponse.json({ success: true, data: { started: true } }, { status: 202 });
}

export const GET = POST;
