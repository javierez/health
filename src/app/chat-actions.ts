"use server";

import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "~/db";
import { chatMessages } from "~/db/schema";
import type { Part } from "~/server/agent/parts";
import { agentTurn } from "~/server/agent/turn";
import { transcribe } from "~/server/chat/media";
import { keepPhotos } from "~/server/chat/photos";
import { localDay } from "~/lib/day";
import { toLine, type ChatLine } from "~/server/queries/chat";
import { syncEverything } from "~/server/sync-all";

/** Two minutes of webm is ~1 MB; a resized photo, a few hundred KB. All of it under next.config's 4 MB. */
const MAX_BYTES = 3_500_000;
/** Photos in one message, like a WhatsApp album. */
const MAX_PHOTOS = 6;

/**
 * The panel's chat: the same agent as WhatsApp, same conversation. He types,
 * talks (the browser records, this transcribes), sends photos or a PDF. When
 * he talked, the reply comes back read aloud too.
 */
export async function sendChat(
  form: FormData,
): Promise<{ success: true; data: { mine: ChatLine; replies: ChatLine[]; audio: string | null } } | { success: false; error: string }> {
  const text = String(form.get("text") ?? "").trim().slice(0, 4_000);
  const audio = form.get("audio");
  const file = form.get("pdf");
  const voice = audio instanceof File && audio.size > 0 ? audio : null;
  const pdf = file instanceof File && file.size > 0 ? file : null;
  const images = form
    .getAll("photo")
    .filter((p): p is File => p instanceof File && p.size > 0)
    .slice(0, MAX_PHOTOS);
  if (!text && !voice && !pdf && images.length === 0) return { success: false, error: "No hay nada que mandar" };
  const size = [voice, pdf, ...images].reduce((n, f) => n + (f?.size ?? 0), 0);
  if (size > MAX_BYTES) {
    return { success: false, error: voice ? "Demasiado grande: dos minutos de voz como mucho" : "Demasiado grande para aquí: mándalo por WhatsApp" };
  }

  let heard: string | null = null;
  if (voice) {
    heard = await transcribe(Buffer.from(await voice.arrayBuffer()), voice.type || "audio/webm").catch(() => null);
    if (!heard) return { success: false, error: "No te he oído bien. Prueba otra vez o escríbelo." };
  }
  const body = [heard, text].filter(Boolean).join("\n") || null;

  const at = new Date();
  const [row] = await db
    .insert(chatMessages)
    .values({ direction: "in", type: images.length > 0 ? "image" : pdf ? "document" : voice ? "audio" : "text", body, channel: "web", createdAt: at })
    .returning();
  if (!row) return { success: false, error: "No se pudo guardar" };

  try {
    return { success: true, data: await answer(row, body, images, pdf) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db.update(chatMessages).set({ error: detail.slice(0, 500) }).where(eq(chatMessages.id, row.id));
    return { success: false, error: "No he podido contestar. Prueba otra vez." };
  }
}

async function answer(row: typeof chatMessages.$inferSelect, body: string | null, images: File[], pdf: File | null) {
  const at = row.createdAt;
  const photos = await Promise.all(images.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()), mime: f.type })));
  const parts: Part[] = [
    ...photos.map((p) => ({ kind: "image" as const, ...p })),
    ...(pdf ? [{ kind: "pdf" as const, data: Buffer.from(await pdf.arrayBuffer()) }] : []),
    ...(body ? [{ kind: "text" as const, text: body }] : []),
  ];
  const [turn, kept] = await Promise.all([
    agentTurn({ channel: "web", messageId: row.id, parts, at, photo: photos.length > 0 }),
    keepPhotos(photos.map((p, position) => ({ messageId: row.id, turnId: row.id, position, data: p.data }))),
  ]);
  if (turn.detail) await db.update(chatMessages).set({ error: turn.detail.slice(0, 500) }).where(eq(chatMessages.id, row.id));

  // One row per bubble, like WhatsApp; what was done rides on the first.
  const out = await db
    .insert(chatMessages)
    .values(
      turn.messages.map((body, i) => ({
        direction: "out",
        type: "text",
        body,
        status: "sent",
        channel: "web" as const,
        raw: i === 0 ? { actions: turn.actions } : null,
      })),
    )
    .returning();
  // A sync takes minutes: the reply goes now, the data arrives behind it.
  if (turn.sync) after(() => syncEverything());

  const today = localDay(new Date());
  return {
    mine: toLine(row, today, kept),
    replies: out.sort((a, b) => a.id - b.id).map((m) => toLine(m, today)),
    // Replies are text only, spoken to or not (Javier, 19-oct-2026): «Hablar» shows its answer.
    audio: null as string | null,
  };
}
