import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { WA_TONES, WA_TOPICS, type WaTone, type WaTopic } from "~/db/schema";
import { env } from "~/env";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL, renderTranscript } from "./episodes";

/**
 * The third read of a recording: each conversation in it, how it went and
 * what it was about (Javier, 18-oct-2026: «el tone me gusta… y luego de
 * conversaciones screen»). The same two lists as a WhatsApp chat
 * (`~/server/evolution/read-day`), so a tense call and a tense chat count
 * the same in «Conversaciones» and next to his sleep.
 *
 * Only the stretches with someone else in them, and only what was said in
 * them: a recording of eight hours is read as its three conversations.
 *
 * Bump on any prompt or schema change; recordings with an older version are
 * read again by the next sweep.
 */
export const TONES_VERSION = "tones-v1";

/** A conversation is cut past this, the start and the end kept: that is where tone shows. */
const MAX_PER_TALK = 12_000;
const MAX_CHARS = 60_000;

export const SYSTEM = `Lees conversaciones que grabó el Pocket que Javier lleva encima todo el día: llamadas, reuniones y charlas en persona. Javier es el fundador de Vesta, un CRM para inmobiliarias; habla con agencias que son clientes, con su socio Gonzalo, con su equipo, con amigos y con su familia. Los hablantes salen como SPEAKER_00, SPEAKER_01; uno de ellos es Javier.

Lo que escribes lo usa su asistente de salud: el tono de sus conversaciones se cruza con su sueño y su recuperación (WHOOP) para ver si los días tensos le pasan factura.

Para cada conversación:
- tone: buena (cariño, risas, una buena noticia, un cliente contento), neutra (logística, trabajo normal), tensa (prisas, reproches, presión, una discusión), mala (una mala noticia, tristeza, un conflicto fuerte). Cómo le pudo dejar a él, no a los demás.
- topic: de esta lista y nada más: Clientes (agencias e inmobiliarias), Socio (Gonzalo), Equipo (quien trabaja con él en Vesta), Familia, Pareja, Amigos, Dinero (facturas, cobros, bancos, impuestos), Salud (médicos, citas, pruebas), Otros.
- effect: solo cuando se nota en lo que se dice, de tú y con prudencia: "Te pudo dejar con prisa por la entrega." Si no se nota nada, no lo pongas.

Reglas:
- Te basas solo en lo que se dice. No lees la mente: "puede", "parece".
- No diagnosticas ni pones etiquetas de salud mental.
- Nada de rayas largas ni medias.`;

export const TOOL: Anthropic.Tool = {
  name: "leer_tono",
  description: "Cada conversación leída: cómo fue, de qué y, si se nota, cómo le pudo dejar.",
  input_schema: {
    type: "object",
    properties: {
      conversaciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            n: { type: "integer", description: "El número de la conversación, tal cual sale en su cabecera." },
            tone: { type: "string", enum: [...WA_TONES] },
            topic: { type: "string", enum: [...WA_TOPICS] },
            effect: { type: "string" },
          },
          required: ["n", "tone", "topic"],
        },
      },
    },
    required: ["conversaciones"],
  },
  cache_control: { type: "ephemeral" },
};

export interface Talk {
  /** The episode's `seq`. */
  n: number;
  /** Who it was with, from the classifier: «client», «friend»… */
  with: string | null;
  turns: { speaker: string; text: string; startSeconds: number | null }[];
}

export interface Tone {
  n: number;
  tone: WaTone;
  theme: WaTopic;
  effect: string | null;
}

/** The start and the end of a long one, the middle cut. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n[…]\n${text.slice(-half)}`;
}

/** What the model reads: each conversation under its number. Null when there is nothing to read. */
export function prompt(talks: Talk[]): string | null {
  const parts = talks
    .map((t) => ({ t, text: renderTranscript(t.turns, null).trim() }))
    .filter((p) => p.text.length > 0);
  if (parts.length === 0) return null;
  const each = Math.min(MAX_PER_TALK, Math.floor(MAX_CHARS / parts.length));
  return parts.map(({ t, text }) => `## Conversación ${t.n}${t.with ? ` (con: ${t.with})` : ""}\n${clip(text, each)}`).join("\n\n");
}

const toneSchema = z.object({
  n: z.coerce.number().int(),
  tone: z.enum(WA_TONES),
  topic: z.enum(WA_TOPICS).catch("Otros"),
  effect: z.string().trim().min(1).max(200).optional().catch(undefined),
});

/** One per conversation asked for; an unknown number or a bad tone is dropped, never guessed. */
export function parseTones(input: unknown, asked: number[]): Tone[] {
  const list = z.object({ conversaciones: z.array(z.unknown()) }).safeParse(input);
  if (!list.success) return [];
  const out = new Map<number, Tone>();
  for (const raw of list.data.conversaciones) {
    const r = toneSchema.safeParse(raw);
    if (!r.success || !asked.includes(r.data.n) || out.has(r.data.n)) continue;
    out.set(r.data.n, { n: r.data.n, tone: r.data.tone, theme: r.data.topic, effect: r.data.effect ? sinRayas(r.data.effect) : null });
  }
  return [...out.values()];
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function readTones(talks: Talk[]): Promise<{ ok: true; tones: Tone[] } | { ok: false; detail: string }> {
  const content = prompt(talks);
  if (!content) return { ok: true, tones: [] };
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2_048,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Anthropic call failed" };
  }
  if (message.stop_reason === "max_tokens") return { ok: false, detail: "truncated at max_tokens" };
  const block = message.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") return { ok: false, detail: "no tool_use block" };
  return { ok: true, tones: parseTones(block.input, talks.map((t) => t.n)) };
}
