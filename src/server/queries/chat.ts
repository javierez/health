import { desc } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages } from "~/db/schema";
import { dayTitle, localClock, localDay } from "~/lib/day";
import { photoSrc, photosOf } from "~/server/chat/photos";

/** One bubble of the chat, from WhatsApp or the panel: it is one conversation. */
export interface ChatLine {
  id: number;
  /** "Hoy", "Ayer", "mié, 15 oct": shown once, where the day changes. */
  day: string;
  clock: string;
  mine: boolean;
  /** "Foto", "Vídeo"… for an attachment; none when its photos are shown. */
  attachment: string | null;
  /** His photos in it, as image URLs. */
  photos: string[];
  body: string | null;
  /** What the agent did in that turn: "Apuntado: …". Only kept for the panel's turns. */
  actions: string[];
  failed: boolean;
}

const ATTACHMENT: Record<string, string> = { image: "Foto", video: "Vídeo", audio: "Nota de voz", document: "PDF" };

export function toLine(m: typeof chatMessages.$inferSelect, today: string, photoIds: number[] = []): ChatLine {
  const actions = (m.raw as { actions?: unknown } | null)?.actions;
  return {
    id: m.id,
    day: dayTitle(localDay(m.createdAt), today),
    clock: localClock(m.createdAt),
    mine: m.direction === "in",
    attachment: photoIds.length > 0 ? null : (ATTACHMENT[m.type] ?? null),
    photos: photoIds.map(photoSrc),
    body: m.body,
    actions: Array.isArray(actions) ? actions.filter((a): a is string => typeof a === "string") : [],
    failed: m.status === "failed",
  };
}

/** The last stretch of the conversation, oldest first. */
export async function loadChat(limit = 60, now = new Date()): Promise<ChatLine[]> {
  const rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt), desc(chatMessages.id)).limit(limit);
  const today = localDay(now);
  const kept = await photosOf(
    rows.flatMap((r) => (r.direction === "in" && r.type === "image" ? [r.id] : [])),
    "message",
  );
  return rows.reverse().map((m) => toLine(m, today, kept.get(m.id)));
}
