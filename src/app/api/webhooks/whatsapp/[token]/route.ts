import { after, NextResponse } from "next/server";

import { handleWebhook } from "~/server/chat/handle";

export const maxDuration = 300;

/**
 * His health chat: what he writes to the 621. Meta calls Vesta (one webhook
 * per app, and the 621 is Vesta's support line); Vesta sees his number and
 * forwards the payload here untouched instead of answering it.
 *
 * Meta's signature was already checked by Vesta. Here, like the Pocket
 * webhook, the caller is decided by the token in the URL.
 *
 * Answer first, read after: a video takes half a minute to cut and read.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (token !== process.env.SYNC_SECRET) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const payload: unknown = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ success: false, error: "bad json" }, { status: 400 });

  after(() => handleWebhook(payload));
  return NextResponse.json({ success: true });
}
