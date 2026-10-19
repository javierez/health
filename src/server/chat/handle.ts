import { and, eq, gt, lte, or, sql } from "drizzle-orm";

import { db } from "~/db";
import { assistantMessages, chatMessages } from "~/db/schema";
import { env } from "~/env";
import { typingMs } from "~/lib/bubbles";
import { type Part } from "~/server/agent/parts";
import { agentTurn } from "~/server/agent/turn";
import { markRead, sendText } from "~/server/assistant/whatsapp";
import { syncEverything } from "~/server/sync-all";
import { downloadMedia, READABLE, shrink, transcribe, videoFrames } from "./media";
import { keepPhotos } from "./photos";

/**
 * The 621's webhook, as Vesta forwards it: Meta's payload untouched. Only his
 * number is read; anything else that slipped through is ignored.
 */
interface WaMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

export interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  image?: WaMedia;
  video?: WaMedia;
  audio?: WaMedia;
  document?: WaMedia;
}

interface WaStatus {
  id: string;
  status: string;
  errors?: { code?: number; title?: string }[];
}

interface WaPayload {
  entry?: { changes?: { value?: { messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[];
}

const digits = (n: string | undefined) => (n ?? "").replace(/\D/g, "");

/** The last nine digits, the way Vesta compares a Spanish number with or without 34. */
export function sameNumber(a: string | undefined, b: string | undefined): boolean {
  const x = digits(a).slice(-9);
  return x.length === 9 && x === digits(b).slice(-9);
}

export async function handleWebhook(payload: unknown): Promise<void> {
  for (const entry of (payload as WaPayload | null)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) await recordStatus(s);
      for (const m of change.value?.messages ?? []) {
        if (sameNumber(m.from, env.WHATSAPP_TO)) await handleInbound(m);
      }
    }
  }
}

/** Meta says a message was delivered, read, or dropped (131047 outside the 24 h). */
async function recordStatus(s: WaStatus): Promise<void> {
  const e = s.errors?.[0];
  const error = e ? `${e.code ?? "?"}: ${e.title ?? ""}` : null;
  await db.update(chatMessages).set({ status: s.status, error }).where(eq(chatMessages.waId, s.id));
  if (s.status === "failed") {
    await db.update(assistantMessages).set({ status: "failed", error }).where(eq(assistantMessages.waMessageId, s.id));
  }
}

const TYPES = new Set(["text", "image", "video", "audio", "document"]);
/** Not something to answer: kept, never replied to. */
const IGNORED = new Set(["reaction", "sticker"]);

/**
 * Photos sent together (a plate and its label, the front and back of a box)
 * come as one webhook each, a second or two apart. Each waits this long; the
 * last to arrive answers for all of them in one turn.
 */
const ALBUM_WAIT_MS = 4_000;
const PENDING = "pending";
const GROUPED = "grouped";

type Problem = "unsupported" | "voice-off" | "heic";
const PROBLEM: Record<Problem, string> = {
  unsupported: "Eso no lo sé leer. Mándame texto, una foto, un vídeo, una nota de voz o un PDF.",
  "voice-off": "Las notas de voz aún no las oigo. Escríbemelo, porfa.",
  heic: "Esa foto me llega como archivo HEIC y no la sé abrir. Mándamela como foto, no como documento.",
};

const captionOf = (m: WaMessage) => m.text?.body ?? (m.image ?? m.video ?? m.audio ?? m.document)?.caption ?? null;
const isPhotoFile = (m: WaMessage) => m.type === "document" && (m.document?.mime_type ?? "").startsWith("image/");

export async function handleInbound(m: WaMessage): Promise<void> {
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
  const file = m.image ?? m.video ?? m.audio ?? m.document;
  const media = m.type === "image" || m.type === "video" || m.type === "document";
  // A text right behind a photo goes with it: «esto es la cena».
  const joins = media || (!IGNORED.has(m.type) && (await albumOpen()));

  // 🚨 Claimed first: Meta retries a webhook it thinks failed, and two copies
  // of a video would be two paid reads and two replies.
  const [row] = await db
    .insert(chatMessages)
    .values({
      waId: m.id,
      direction: "in",
      type: isPhotoFile(m) ? "image" : TYPES.has(m.type) ? m.type : "other",
      body: captionOf(m),
      mediaId: file?.id ?? null,
      status: joins ? PENDING : null,
      raw: m,
      createdAt: at,
    })
    .onConflictDoNothing()
    .returning({ id: chatMessages.id });
  if (!row || IGNORED.has(m.type)) return;

  await markRead(m.id);
  let group = [{ id: row.id, m }];
  if (joins) {
    await new Promise((r) => setTimeout(r, ALBUM_WAIT_MS));
    if (await newerPending(row.id)) return;
    group = await claim(row.id);
    if (!group.some((g) => g.id === row.id)) return;
  }
  try {
    const read = await Promise.all(group.map(async (g) => ({ g, got: await toParts(g.m) })));
    const ok = read.flatMap((r) => (typeof r.got === "string" ? [] : [{ g: r.g, parts: r.got }]));
    for (const p of new Set(read.flatMap((r) => (typeof r.got === "string" ? [r.got] : [])))) await sendText(PROBLEM[p]);
    if (ok.length === 0) return;
    // What a voice note said is its text from now on, in the board and in
    // the history the next message is read with.
    for (const { g, parts } of ok) {
      if (g.m.type === "audio" && parts[0]?.kind === "text") await db.update(chatMessages).set({ body: parts[0].text }).where(eq(chatMessages.id, g.id));
    }

    const images = ok.flatMap(({ g, parts }) =>
      parts.flatMap((p) => (p.kind === "image" ? [p.data] : [])).map((data, position) => ({ messageId: g.id, turnId: row.id, position, data })),
    );
    const [turn] = await Promise.all([
      agentTurn({
        channel: "whatsapp",
        messageId: row.id,
        group: group.map((g) => g.id),
        parts: ok.flatMap((o) => o.parts),
        at,
        // Only a photo or a video proves a habit that asks for one.
        photo: images.length > 0 || ok.some((o) => o.g.m.type === "video"),
      }),
      keepPhotos(images),
    ]);
    if (turn.detail) await db.update(chatMessages).set({ error: turn.detail.slice(0, 500) }).where(eq(chatMessages.id, row.id));
    await reply(turn.messages, m.id);
    if (turn.sync) await syncEverything();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db.update(chatMessages).set({ error: detail.slice(0, 500) }).where(eq(chatMessages.id, row.id));
    await sendText("No he podido leerlo. Mándamelo otra vez o escríbemelo.");
  }
}

/** A photo from the last two minutes still waiting for the rest of its group. */
async function albumOpen(): Promise<boolean> {
  const [r] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.status, PENDING), gt(chatMessages.createdAt, sql`now() - interval '2 minutes'`)))
    .limit(1);
  return r !== undefined;
}

async function newerPending(id: number): Promise<boolean> {
  const [r] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.status, PENDING), gt(chatMessages.id, id)))
    .limit(1);
  return r !== undefined;
}

/**
 * The group, taken in one statement so two webhooks never answer the same
 * photo. A row a crash left pending more than a day ago stays out.
 */
async function claim(id: number): Promise<{ id: number; m: WaMessage }[]> {
  const rows = await db
    .update(chatMessages)
    .set({ status: GROUPED })
    .where(
      and(
        eq(chatMessages.status, PENDING),
        lte(chatMessages.id, id),
        or(eq(chatMessages.id, id), gt(chatMessages.createdAt, sql`now() - interval '1 day'`)),
      ),
    )
    .returning({ id: chatMessages.id, raw: chatMessages.raw });
  return rows.sort((a, b) => a.id - b.id).map((r) => ({ id: r.id, m: r.raw as WaMessage }));
}

/**
 * Bubble by bubble, with "escribiendo…" in between, the way a person types.
 * Always text, even to a voice note: Javier, 19-oct-2026, «the app is
 * replying with audio. desactivate that functionality».
 */
async function reply(messages: string[], inboundId: string): Promise<void> {
  for (const [i, text] of messages.entries()) {
    if (i > 0) {
      await markRead(inboundId);
      await new Promise((r) => setTimeout(r, typingMs(text)));
    }
    await sendText(text);
  }
}

/** Past ~3,5 MB the model refuses a picture: a photo sent as a file is shrunk first. */
const MODEL_MAX_BYTES = 3_500_000;

async function asImage(bytes: Buffer, mime: string): Promise<Part> {
  if (bytes.length <= MODEL_MAX_BYTES && READABLE.has(mime)) return { kind: "image", data: bytes, mime };
  return { kind: "image", data: await shrink(bytes, 1600), mime: "image/jpeg" };
}

/** The attachment first, then his caption: the model reads it as he sent it. */
async function toParts(m: WaMessage): Promise<Part[] | Problem> {
  const caption = captionOf(m);
  const text: Part[] = caption ? [{ kind: "text", text: caption }] : [];

  if (m.type === "text") return text;
  if (m.type === "image" && m.image?.id) {
    const { bytes, mime } = await downloadMedia(m.image.id);
    return [await asImage(bytes, mime), ...text];
  }
  if (m.type === "video" && m.video?.id) {
    const { bytes } = await downloadMedia(m.video.id);
    return [{ kind: "frames", frames: await videoFrames(bytes) }, ...text];
  }
  if (m.type === "audio" && m.audio?.id) {
    const { bytes, mime } = await downloadMedia(m.audio.id);
    const heard = await transcribe(bytes, mime);
    return heard ? [{ kind: "text", text: heard }] : "voice-off";
  }
  if (m.type === "document" && m.document?.id) {
    const mime = m.document.mime_type ?? "";
    if (mime === "application/pdf") {
      const { bytes } = await downloadMedia(m.document.id);
      return [{ kind: "pdf", data: bytes }, ...text];
    }
    if (READABLE.has(mime)) {
      const { bytes } = await downloadMedia(m.document.id);
      return [await asImage(bytes, mime), ...text];
    }
    if (/hei[cf]/i.test(mime) || /\.hei[cf]$/i.test(m.document.filename ?? "")) return "heic";
  }
  return "unsupported";
}
