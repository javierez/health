import { env } from "~/env";
import type { EvoRecord } from "./records";

/**
 * 🚨 Read only. The instance is his real WhatsApp, the one his clients and
 * friends write to; Vesta also lives on it. This file calls two endpoints and
 * neither changes anything: no send, no "read" ticks, no "escribiendo…".
 * Anything else on the Evolution API (markMessageAsRead, sendPresence,
 * sendText…) does not belong here.
 */
function config() {
  const { EVOLUTION_API_URL: url, EVOLUTION_INSTANCE: instance, EVOLUTION_API_KEY: key } = env;
  return url && instance && key ? { url: url.replace(/\/$/, ""), instance, key } : null;
}

export const evolutionReady = () => config() !== null;

async function post<T>(path: string, body: unknown): Promise<T> {
  const c = config();
  if (!c) throw new Error("Evolution not configured");
  const res = await fetch(`${c.url}${path}/${c.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: c.key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`evolution ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/**
 * One page, newest first. Evolution serves 50 a page whatever the limit, and
 * ignores a date filter: reading back to a day means paging until past it.
 */
export async function messagesPage(page: number): Promise<{ records: EvoRecord[]; pages: number }> {
  const data = await post<{ messages?: { records?: EvoRecord[]; pages?: number } }>("/chat/findMessages", {
    limit: 50,
    page,
  });
  return { records: data.messages?.records ?? [], pages: data.messages?.pages ?? 1 };
}

/** A voice note's audio, fetched by Evolution from WhatsApp. Fails once WhatsApp dropped the file (~2 weeks). */
export async function voiceNote(id: string): Promise<{ bytes: Buffer; mime: string }> {
  const data = await post<{ base64?: string; mimetype?: string }>("/chat/getBase64FromMediaMessage", {
    message: { key: { id } },
    convertToMp4: false,
  });
  if (!data.base64) throw new Error(`voice note ${id}: no audio`);
  return { bytes: Buffer.from(data.base64, "base64"), mime: data.mimetype ?? "audio/ogg" };
}
