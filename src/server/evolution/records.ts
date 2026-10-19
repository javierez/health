import { localDay } from "~/lib/day";

/**
 * What Evolution's `findMessages` returns, as far as this app reads it. The
 * whole record still goes to `raw`, minus the binary bits.
 */
export interface EvoRecord {
  key: { id: string; fromMe: boolean; remoteJid: string; remoteJidAlt?: string | null };
  pushName?: string | null;
  messageType: string;
  messageTimestamp: number | string;
  message?: Record<string, unknown> | null;
  [other: string]: unknown;
}

export interface WaRow {
  id: string;
  chat: string;
  name: string | null;
  fromMe: boolean;
  at: Date;
  day: string;
  type: string;
  body: string | null;
  seconds: number | null;
  raw: unknown;
}

/** Plumbing, not something anyone said. */
const SKIP_TYPES = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "reactionMessage",
  "pollUpdateMessage",
  "messageContextInfo",
  "editedMessage",
  // An album's wrapper: its photos come as their own messages.
  "albumMessage",
]);

/** Groups, statuses, broadcast lists, channels and bots: not a conversation of his. */
const SKIP_JIDS = ["@g.us", "@broadcast", "@newsletter", "@bot"];

/**
 * The other person's number, digits only. A chat on a LID ("123@lid", a
 * WhatsApp alias) resolves to the number when Evolution stamped it on the
 * message; when not, it stays `lid:123` until a sibling message tells
 * (`~/server/evolution/sync` fixes those after every import).
 */
export function chatOf(key: EvoRecord["key"]): string | null {
  if (SKIP_JIDS.some((s) => key.remoteJid.endsWith(s))) return null;
  const phone = [key.remoteJidAlt, key.remoteJid].find((j) => j?.endsWith("@s.whatsapp.net"));
  if (phone) return phone.split("@")[0]!;
  const [user, server] = key.remoteJid.split("@");
  return server === "lid" && user ? `lid:${user}` : null;
}

type Part = {
  text?: string;
  caption?: string;
  title?: string;
  fileName?: string;
  seconds?: number;
  displayName?: string;
  contentText?: string;
  selectedDisplayText?: string;
  hydratedTemplate?: { hydratedContentText?: string };
  message?: Record<string, unknown>;
};

/**
 * The words in it: the text, a caption, a document's name, what a business's
 * template or button said. Null for a voice note or a bare photo.
 */
export function bodyOf(message: EvoRecord["message"]): string | null {
  const m = (message ?? {}) as Record<string, Part | string | undefined>;
  const part = (k: string) => (typeof m[k] === "object" ? (m[k] as Part) : undefined);
  // A photo of an album comes wrapped: read the photo.
  const child = part("associatedChildMessage")?.message;
  if (child) return bodyOf(child);
  const text =
    (typeof m.conversation === "string" ? m.conversation : undefined) ??
    part("extendedTextMessage")?.text ??
    part("imageMessage")?.caption ??
    part("videoMessage")?.caption ??
    part("documentMessage")?.title ??
    part("documentMessage")?.fileName ??
    part("contactMessage")?.displayName ??
    part("templateMessage")?.hydratedTemplate?.hydratedContentText ??
    part("buttonsMessage")?.contentText ??
    part("buttonsResponseMessage")?.selectedDisplayText;
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/** Thumbnails, waveforms and scan sidecars: kilobytes of base64 nobody reads. */
const BINARY = new Set([
  "jpegThumbnail",
  "waveform",
  "streamingSidecar",
  "scansSidecar",
  "firstScanSidecar",
  "midQualityFileSha256",
  "thumbnailSha256",
  "thumbnailEncSha256",
  "interactiveAnnotations",
]);

export function slim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(slim);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !BINARY.has(k))
      .map(([k, v]) => [k, slim(v)]),
  );
}

/** One record as a row, or null when it is not part of a conversation of his. */
export function toRow(r: EvoRecord): WaRow | null {
  if (!r.key?.id || SKIP_TYPES.has(r.messageType)) return null;
  const chat = chatOf(r.key);
  const seconds = Number(r.messageTimestamp);
  if (!chat || !Number.isFinite(seconds) || seconds <= 0) return null;
  const at = new Date(seconds * 1000);
  const audio = (r.message?.audioMessage as Part | undefined)?.seconds;
  return {
    id: r.key.id,
    chat,
    name: r.key.fromMe ? null : r.pushName?.trim() || null,
    fromMe: r.key.fromMe,
    at,
    day: localDay(at),
    type: r.messageType,
    body: bodyOf(r.message),
    seconds: typeof audio === "number" ? audio : null,
    raw: slim(r),
  };
}

const LABEL: Record<string, string> = {
  audioMessage: "nota de voz",
  imageMessage: "foto",
  associatedChildMessage: "foto",
  videoMessage: "vídeo",
  documentMessage: "documento",
  stickerMessage: "sticker",
  locationMessage: "ubicación",
  contactMessage: "contacto",
};

/** How a message reads in a transcript: `[nota de voz 0:25] lo que dijo`, `[foto] la caption`. */
export function lineText(m: { type: string; body: string | null; seconds: number | null }): string {
  const label = LABEL[m.type];
  const len = m.seconds ? ` ${Math.floor(m.seconds / 60)}:${String(m.seconds % 60).padStart(2, "0")}` : "";
  const tag = label ? `[${label}${len}]` : null;
  return [tag, m.body].filter(Boolean).join(" ") || `[${m.type}]`;
}

/** `+34 636 03 61 16` for a Spanish number, `+…` as is otherwise. A LID is not a number. */
export function phoneLabel(chat: string): string {
  if (chat.startsWith("lid:")) return "Contacto sin número";
  const m = /^34(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(chat);
  return m ? `+34 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${chat}`;
}
