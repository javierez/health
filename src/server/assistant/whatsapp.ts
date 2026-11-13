import { and, desc, eq } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages } from "~/db/schema";
import { env } from "~/env";
import { oneLine } from "~/lib/bubbles";

/**
 * Through the 621 (Vesta's support line, WABA `1820772069343247`), by Meta's
 * Cloud API directly. Nothing here imports Vesta: same number, separate code.
 * What he writes to the 621 from `WHATSAPP_TO` Vesta forwards here instead of
 * answering it, so the 621 is his health chat and everyone else's support.
 *
 * 🚨 A free-text message only arrives inside the 24 h after he last wrote;
 * outside it Meta accepts it anyway and drops it later (131047). So what goes
 * out on its own (`sendNotice`) checks the window first, and outside it goes
 * as the template. The template is MARKETING on purpose: the WABA is shared
 * with the 684 and the 711, and a UTILITY that Meta re-files as MARKETING is
 * a strike against all three.
 */
export const TEMPLATE = { name: "salud_aviso_v1", language: "es" } as const;
export const TEMPLATE_BODY =
  "Aviso de tu asistente de salud: {{1}} Lo tienes todo en tu panel de Salud.";

const GRAPH = "https://graph.facebook.com/v21.0";

type Sent = { ok: true; id: string | null } | { ok: false; detail: string };

export function whatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TO);
}

async function post(payload: Record<string, unknown>): Promise<Sent> {
  if (!whatsappConfigured()) return { ok: false, detail: "not-configured" };
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
  const body = (await res.json().catch(() => null)) as {
    messages?: { id?: string }[];
    error?: { code?: number; message?: string };
  } | null;
  if (!res.ok) return { ok: false, detail: `${body?.error?.code ?? res.status}: ${body?.error?.message ?? ""}` };
  return { ok: true, id: body?.messages?.[0]?.id ?? null };
}

/** Every message that goes out is also a line of the chat, sent or not. */
async function logged(type: "template" | "text" | "audio", text: string, sent: Sent): Promise<Sent> {
  await db.insert(chatMessages).values({
    waId: sent.ok ? sent.id : null,
    direction: "out",
    type,
    body: text,
    status: sent.ok ? "sent" : "failed",
    error: sent.ok ? null : sent.detail,
  });
  return sent;
}

/** A scheduled notice: the approved template, his text in `{{1}}`. */
export async function sendWhatsApp(note: string): Promise<Sent> {
  const text = oneLine(note);
  const sent = await post({
    to: env.WHATSAPP_TO,
    type: "template",
    template: {
      name: TEMPLATE.name,
      language: { code: TEMPLATE.language },
      components: [{ type: "body", parameters: [{ type: "text", text }] }],
    },
  });
  return whatsappConfigured() ? logged("template", text, sent) : sent;
}

/** A reply in the chat. Only right after he wrote: see the note above. */
export async function sendText(text: string): Promise<Sent> {
  const sent = await post({ to: env.WHATSAPP_TO, type: "text", text: { body: text } });
  return whatsappConfigured() ? logged("text", text, sent) : sent;
}

/** Whether his last WhatsApp message is recent enough for free text, with half an hour to spare. */
async function insideWindow(now: Date): Promise<boolean> {
  const [last] = await db
    .select({ at: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.direction, "in"), eq(chatMessages.channel, "whatsapp")))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return Boolean(last && now.getTime() - last.at.getTime() < 23.5 * 3_600_000);
}

/**
 * A notice or a reminder, sent on its own. As a plain message while the
 * window is open, so it reads like the rest of the chat and not like «Aviso
 * de tu asistente de salud: …» (Javier, 20-oct-2026: «too ai»); the template
 * only when it is closed.
 */
export async function sendNotice(text: string, now = new Date()): Promise<Sent> {
  return (await insideWindow(now)) ? sendText(text) : sendWhatsApp(text);
}

/**
 * Blue ticks and "escribiendo…" while a video is being cut and read, which
 * takes half a minute. Best effort: a failure here changes nothing.
 */
export async function markRead(messageId: string): Promise<void> {
  await post({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });
}

/**
 * A reply as a voice note, when he sent one. Meta wants the audio uploaded
 * first (Ogg/Opus, or it arrives as a file and not as a voice note) and the
 * message pointing at its id. The text is what the chat keeps.
 */
export async function sendVoice(ogg: Buffer, text: string): Promise<Sent> {
  if (!whatsappConfigured()) return { ok: false, detail: "not-configured" };
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "audio/ogg");
  form.append("file", new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }), "respuesta.ogg");
  let id: string | undefined;
  try {
    const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
    });
    const body = (await res.json().catch(() => null)) as { id?: string; error?: { code?: number; message?: string } } | null;
    if (!res.ok || !body?.id) return { ok: false, detail: `upload ${body?.error?.code ?? res.status}: ${body?.error?.message ?? ""}` };
    id = body.id;
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
  return logged("audio", text, await post({ to: env.WHATSAPP_TO, type: "audio", audio: { id } }));
}
