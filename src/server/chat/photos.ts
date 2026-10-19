import { inArray } from "drizzle-orm";

import { db } from "~/db";
import { photos } from "~/db/schema";
import { shrink } from "./media";

/** The size kept: sharp in a meal's detail, ~40 KB. */
const KEEP_PX = 640;

/**
 * His photos, kept after the reply is written: a failure here never costs
 * him the answer, only the picture in the panel.
 */
export async function keepPhotos(list: { messageId: number; turnId: number; position: number; data: Buffer }[]): Promise<number[]> {
  if (list.length === 0) return [];
  try {
    const rows = await Promise.all(
      list.map(async (p) => ({
        chatMessageId: p.messageId,
        turnId: p.turnId,
        position: p.position,
        jpeg: (await shrink(p.data, KEEP_PX)).toString("base64"),
      })),
    );
    const kept = await db.insert(photos).values(rows).onConflictDoNothing().returning({ id: photos.id });
    return kept.map((k) => k.id);
  } catch (err) {
    console.error("[photos] not kept:", err instanceof Error ? err.message : err);
    return [];
  }
}

export const photoSrc = (id: number) => `/api/photo/${id}`;

/** The photo ids of each message, in the order they were sent. */
export async function photosOf(messageIds: number[], by: "message" | "turn"): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (messageIds.length === 0) return out;
  const key = by === "message" ? photos.chatMessageId : photos.turnId;
  const rows = await db
    .select({ id: photos.id, owner: key, messageId: photos.chatMessageId, position: photos.position })
    .from(photos)
    .where(inArray(key, messageIds));
  rows.sort((a, b) => a.messageId - b.messageId || a.position - b.position);
  for (const r of rows) out.set(r.owner, [...(out.get(r.owner) ?? []), r.id]);
  return out;
}
