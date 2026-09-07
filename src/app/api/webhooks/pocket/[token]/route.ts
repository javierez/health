import { NextResponse } from "next/server";

import { ingestOne, sweep } from "~/server/pocket/ingest";

export const maxDuration = 300;

/**
 * Pocket's notification — the fast lane.
 *
 * Two things carried over from Vesta's handler, both learned the hard way:
 *
 * 1. The notification is treated as a DOORBELL. Only a recording id is read
 *    from the body; the content is fetched back over the API. Pocket documents
 *    the events but NOT the payload shape, so building ingestion on that shape
 *    would be building on sand. If no id is recognised we fall back to a sweep.
 *
 * 2. Who is calling is decided by a TOKEN IN THE URL, not by the body. Personal
 *    Pocket accounts can only register the webhook from the app — there is no
 *    REST endpoint, every `/public/webhook*` path 404s.
 *
 * Delivery is at-least-once with 3 retries and then it gives up, so this never
 * replaces the periodic sweep; it just makes the common case seconds instead of
 * an hour.
 */
const ID_PATHS = [
  ["recording", "id"],
  ["recording_id"],
  ["recordingId"],
  ["data", "recording", "id"],
  ["data", "recording_id"],
  ["data", "id"],
  ["id"],
];

function readPath(payload: unknown, path: string[]): string | null {
  let cursor: unknown = payload;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (token !== process.env.SYNC_SECRET) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    // An unreadable body is not fatal: fall through to the sweep.
  }

  for (const path of ID_PATHS) {
    const id = readPath(payload, path);
    if (id) {
      const res = await ingestOne(id);
      return NextResponse.json({ success: res.ok, data: res });
    }
  }

  const report = await sweep({ limit: 20 });
  return NextResponse.json({ success: true, data: { fallback: "sweep", ...report } });
}
