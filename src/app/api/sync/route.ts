import { NextResponse } from "next/server";

import { sweep } from "~/server/pocket/ingest";

// A sweep fetches and classifies serially; 100 recordings will not fit in 60s.
export const maxDuration = 300;

/**
 * Manual sync, and the cron target.
 *
 * The button on the board calls this without a secret (same origin, one user).
 * A cron must send `Authorization: Bearer <SYNC_SECRET>`; when the header is
 * present it has to be right, so a wrong secret fails loudly instead of
 * quietly running anyway.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth && auth !== `Bearer ${process.env.SYNC_SECRET}`) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const report = await sweep();
  return NextResponse.json({ success: true, data: report });
}

export const GET = POST;
