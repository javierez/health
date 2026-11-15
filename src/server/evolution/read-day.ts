import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { WA_TONES, WA_TOPICS, type WaChat } from "~/db/schema";
import { env } from "~/env";
import { localClock } from "~/lib/day";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { lineText, phoneLabel } from "./records";

/**
 * A finished day of his WhatsApp, read once: who he talked with, about what,
 * and how the day may have left him, as a number. That number is the point:
 * next to the next morning's recovery it says whether a tense day costs him
 * sleep, which no single conversation does.
 *
 * Bump on any prompt or schema change. The next sync reads yesterday again;
 * the older days are `scripts/read-whatsapp.ts`.
 */
export const WA_VERSION = "wa-day-v3";

/** Past this the model skims without saying so: the biggest chats go in first. */
const MAX_CHARS = 80_000;
const MAX_LINES_PER_CHAT = 200;
const MAX_LINE = 500;

const SYSTEM = `Lees un día entero del WhatsApp personal de Javier: todas sus conversaciones de ese día, una detrás de otra. Javier es el fundador de Vesta, un CRM para inmobiliarias; por este WhatsApp le escriben agencias que son clientes, su socio Gonzalo, su equipo, amigos y familia. "Él" es Javier; el resto aparece con su nombre.

Lo que escribes lo usa su asistente para entender cómo está, y el mood de cada día se cruza con su recuperación de la mañana siguiente (WHOOP) para ver si los días tensos le pasan factura.

summary: una línea, como en un diario y sin sujeto. Con quién habló más, lo que pesó del día y, si se nota, cómo le pudo dejar. "Día de trabajo con agencias; tensión con Pedro por una factura por la tarde y una charla larga y buena con su madre por la noche." Máximo 220 caracteres.

mood: cómo le pudo dejar el día entero, del 1 al 5, por lo que se habló. 1: un día malo o muy tenso (una discusión fuerte, una mala noticia, mucha presión). 2: tenso. 3: normal, logística y trabajo sin más. 4: bueno. 5: muy bueno (cariño, risas, buenas noticias). Pesa lo personal y lo que le exigieron, no cuántos mensajes hubo.

chats: una entrada por cada conversación con algo de contenido. Las que son solo un "ok", un enlace o un sticker, fuera.
- chat: el número tal cual sale en la cabecera de esa conversación.
- line: de qué fue, en una línea corta, sin sujeto y sin empezar por su nombre, que ya sale al lado. "Le pide adelantar la demo al jueves." Máximo 140 caracteres.
- tone: buena (cariño, risas, una buena noticia, un cliente contento), neutra (logística, trabajo normal), tensa (prisas, reproches, presión, una discusión), mala (una mala noticia, tristeza, un conflicto fuerte).
- topic: de qué fue, de esta lista y nada más: Clientes (agencias e inmobiliarias, las que usan Vesta o podrían), Socio (Gonzalo), Equipo (quien trabaja con él en Vesta), Familia, Pareja, Amigos, Dinero (facturas, cobros, bancos, impuestos, aunque sea con un cliente), Salud (médicos, citas, pruebas), Otros. Por lo que se habló; si no está claro, por quién es.
- effect: solo cuando se nota en lo que se dice, de tú y con prudencia: "Te pudo dejar preocupado por el pago." Si no se nota nada, no lo pongas.

Reglas:
- Te basas solo en lo que está escrito. No inventas lo que no se dice ni lees la mente: "puede", "parece".
- No diagnosticas ni pones etiquetas de salud mental.
- Las notas de voz salen con su transcripción cuando la hay; sin ella, solo sabes que la hubo.
- Nada de rayas largas ni medias.`;

const TOOL: Anthropic.Tool = {
  name: "leer_dia",
  description: "El día de WhatsApp leído: una línea, cómo le pudo dejar y cada conversación con algo.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      mood: { type: "integer", minimum: 1, maximum: 5 },
      chats: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chat: { type: "string" },
            line: { type: "string" },
            tone: { type: "string", enum: [...WA_TONES] },
            topic: { type: "string", enum: [...WA_TOPICS] },
            effect: { type: "string" },
          },
          required: ["chat", "line", "tone", "topic"],
        },
      },
    },
    required: ["summary", "mood", "chats"],
  },
  cache_control: { type: "ephemeral" },
};

export interface DayMessage {
  chat: string;
  fromMe: boolean;
  at: Date;
  type: string;
  body: string | null;
  seconds: number | null;
  seen?: string | null;
}

/**
 * The day as the model reads it: the busiest conversations first, each with
 * its name, number and lines. What does not fit is named, not dropped silently.
 */
export function renderDay(day: string, messages: DayMessage[], names: Map<string, string>): string {
  const byChat = new Map<string, DayMessage[]>();
  for (const m of messages) byChat.set(m.chat, [...(byChat.get(m.chat) ?? []), m]);
  const chats = [...byChat.entries()].sort(([, a], [, b]) => b.length - a.length);

  const out = [`Día ${day}. ${messages.length} mensajes en ${chats.length} conversaciones.`];
  let size = out[0]!.length;
  const left: string[] = [];
  for (const [chat, list] of chats) {
    const name = names.get(chat) ?? phoneLabel(chat);
    const lines = list
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(-MAX_LINES_PER_CHAT)
      .map((m) => `${localClock(m.at)} ${m.fromMe ? "Él" : name}: ${lineText(m).replace(/\s+/g, " ").slice(0, MAX_LINE)}`);
    const block = [`\n## ${name} · ${chat} · ${list.length} mensajes`, ...lines].join("\n");
    if (size + block.length > MAX_CHARS) {
      left.push(`${name} (${list.length})`);
      continue;
    }
    out.push(block);
    size += block.length;
  }
  if (left.length > 0) out.push(`\n(Sin leer por espacio: ${left.join(", ")}.)`);
  return out.join("\n");
}

const read = z.object({
  summary: z.string().trim().min(1),
  // A missing or odd mood leaves the day out of the pattern, never a made-up 3.
  mood: z.coerce.number().min(1).max(5).transform(Math.round).nullable().catch(null),
  chats: z
    .array(
      z.object({
        chat: z.string(),
        line: z.string().trim().min(1),
        tone: z.enum(WA_TONES).catch("neutra"),
        // A missing or odd topic counts in no topic, never in «Otros».
        topic: z.enum(WA_TOPICS).nullable().catch(null),
        effect: z.string().optional().catch(undefined),
      }),
    )
    .catch([]),
});

/**
 * On a long day the model sometimes hands its whole answer, or the list, as a
 * JSON string inside `chats` (15-oct-2026, 562 messages). Read it as meant.
 */
function unwrap(input: unknown): unknown {
  const o = input as { summary?: unknown; chats?: unknown } | null;
  if (typeof o?.chats !== "string") return input;
  try {
    const inner = JSON.parse(o.chats) as unknown;
    if (Array.isArray(inner)) return { ...o, chats: inner };
    return typeof inner === "object" && inner !== null ? { ...o, ...inner } : input;
  } catch {
    return input;
  }
}

/**
 * The model's answer as rows. A chat it made up is dropped; the name and the
 * count come from the messages, never from the model.
 */
export function parseRead(
  input: unknown,
  known: Map<string, { name: string; messages: number }>,
): { summary: string; mood: number | null; chats: WaChat[] } | null {
  const r = read.safeParse(unwrap(input));
  if (!r.success) return null;
  const chats = r.data.chats.flatMap((c) => {
    const k = known.get(c.chat.trim());
    if (!k) return [];
    const effect = c.effect?.trim();
    return [
      {
        chat: c.chat.trim(),
        name: k.name,
        messages: k.messages,
        line: sinRayas(dropName(c.line, k.name)),
        tone: c.tone,
        topic: c.topic,
        effect: effect ? sinRayas(effect) : null,
      },
    ];
  });
  return { summary: sinRayas(r.data.summary), mood: r.data.mood, chats };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "Lucía gestiona la cita" next to "Lucia" reads the name twice: the line starts at the verb. */
export function dropName(line: string, name: string): string {
  const first = fold(name).split(/\s+/)[0];
  const [word, ...rest] = line.split(" ");
  if (!first || !word || rest.length === 0 || fold(word).replace(/[,:]$/, "") !== first) return line;
  const after = rest.join(" ");
  return after.charAt(0).toUpperCase() + after.slice(1);
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function readDay(
  day: string,
  messages: DayMessage[],
  names: Map<string, string>,
): Promise<{ ok: true; summary: string; mood: number | null; chats: WaChat[]; model: string } | { ok: false; detail: string }> {
  const known = new Map<string, { name: string; messages: number }>();
  for (const m of messages) {
    const k = known.get(m.chat);
    known.set(m.chat, { name: names.get(m.chat) ?? phoneLabel(m.chat), messages: (k?.messages ?? 0) + 1 });
  }
  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 3_000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: renderDay(day, messages, names) }],
    });
    const block = message.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") return { ok: false, detail: "no tool_use block" };
    const parsed = parseRead(block.input, known);
    return parsed
      ? { ok: true, ...parsed, model: DEFAULT_MODEL }
      : { ok: false, detail: `unreadable reply (${message.stop_reason}): ${JSON.stringify(block.input).slice(0, 300)}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Anthropic call failed" };
  }
}
