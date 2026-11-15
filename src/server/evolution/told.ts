import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gt, gte, inArray } from "drizzle-orm";

import { db } from "~/db";
import { FACT_KINDS, facts, waMessages } from "~/db/schema";
import { env } from "~/env";
import { localClock, localDay } from "~/lib/day";
import { isMood } from "~/lib/trackers";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { FACT_FIELDS, parseFacts, placeFact, TOLD_FIELDS } from "~/server/classify/facts";
import { ensureKind } from "~/server/kinds";
import { readSyncState, writeSyncState } from "~/server/queries/sync-state";
import { learnMovesLater } from "~/server/training/learn";
import { lineText } from "./records";

/**
 * What he tells or shows the people he follows about his body, into his facts
 * like the Pocket's and the chat's: a meal adds up in «Comida», a run counts
 * for his commitments, a headache is compared in «Cómo te afecta». Javier,
 * 14-nov-2026, of Amaya: «le voy a empezar a decir todo lo que como y pasar
 * fotos», «y más cosas que tengamos». Every four hours with the rest of his
 * WhatsApp, after the notes are heard and the photos seen.
 *
 * Bump on any prompt or schema change.
 */
export const TOLD_VERSION = "wa-facts-v1";

const SYSTEM = `Lees un trozo del WhatsApp de Javier con una persona cercana. Él le va contando lo que come, lo que entrena y cómo se encuentra: por escrito, en notas de voz (ya transcritas) o con fotos (llegan descritas: [foto: ...]).

Apunta en facts lo que le pasa A ÉL y cuenta o enseña aquí, cada uno con mensaje: el [n] del mensaje suyo donde lo cuenta o lo enseña.
- meal: una comida o bebida suya, con meal (breakfast, lunch, dinner, snack o drink; un café o una caña sola es drink) y en foods cada alimento con sus gramos y lo que aporta (kcal, protein_g, carbs_g, sugar_g, fiber_g, fat_g, sat_fat_g, salt_g), estimado de lo que dice o de la descripción de la foto. Café, refrescos y alcohol también, con caffeine_mg (un espresso 60, un café con leche 80) y alcohol_g (una caña 8, una copa de vino 12). El agua que se bebe va en water_ml (un vaso 250, una botella 500 si no dice otra). Una comida es UNA aunque venga en varios mensajes: el texto, la foto y lo que añade después van juntos.
- training: un entreno que ya ha hecho ("he corrido 5 km", "hoy pierna", "sentadilla 4x8 a 80"): training gym, run u other (un yoga es other con tipo "Yoga"), con los ejercicios, series, repeticiones y kilos que diga, y distance_km en una carrera.
- body: lo que pesa (weight_kg) o su % de grasa, si lo dice o se ve en la báscula.
- medical: una medicación que toma o deja, una prueba, una cita médica o lo que le ha dicho un médico.
- toilet: cada vez que cuenta que ha ido al baño: toilet pee o poo, feel por cómo dice que ha ido, symptoms y bristol solo si los dice.
- other: un síntoma suyo (dolor de cabeza, fiebre, tos, náuseas), con tipo el síntoma, categoria "Síntomas" y estado true; o algo que hace y lleva (sauna, meditar, una siesta), con tipo, una categoria corta, y valor y unidad si hay cifra ("veinte minutos de sauna": 20 y "min").
Su ánimo no se apunta: el día se lee entero aparte, y Pulso se lo pregunta por la noche.

clock: "HH:MM" solo si dice cuándo fue ("he desayunado a las 8"); si no, cuenta la hora del mensaje. summary: una línea en español, sin sujeto: "Comida: lentejas, pan y un yogur", "Correr: 5 km", "Peso: 78,4 kg", "Dolor de cabeza". Sin rayas largas ni medias. evidence: sus palabras exactas o la descripción de la foto, 160 caracteres como mucho. confidence de 0 a 1: por debajo de 0,6 es que lo deduces.

No apuntes lo de la otra persona, lo que solo se habla o se planea (una receta, un sitio, "luego voy al gym", lo que va a cenar), ni lo que ya está en «Ya apuntado»: si añade algo a una comida o a un entreno de esos, apunta solo lo nuevo. Si no hay nada suyo, la lista vacía.`;

const TOOL: Anthropic.Tool = {
  name: "apuntar",
  description: "Apunta lo que Javier cuenta o enseña en este chat sobre su cuerpo: comidas, entrenos, peso, lo médico, el baño y lo demás que lleva.",
  input_schema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...FACT_KINDS] },
            mensaje: { type: "number", description: "El [n] del mensaje suyo donde lo cuenta o lo enseña." },
            ...FACT_FIELDS,
            ...TOLD_FIELDS,
          },
          required: ["kind", "mensaje", "summary", "evidence", "confidence"],
        },
      },
    },
    required: ["facts"],
  },
};

export interface ChatLine {
  id: string;
  fromMe: boolean;
  at: Date;
  day: string;
  type: string;
  body: string | null;
  seconds: number | null;
  seen: string | null;
}

/** The chat as the model reads it: `[3] 2026-11-14 14:02 Javier: [foto: un plato de lentejas]`, 500 characters a line at most. */
export function transcript(lines: ChatLine[], name: string): string {
  return lines.map((m, i) => `[${i + 1}] ${m.day} ${localClock(m.at)} ${m.fromMe ? "Javier" : name}: ${lineText(m).slice(0, 500)}`).join("\n");
}

/**
 * His facts out of the model's answer, each at its message (or the hour he
 * said). A line of the other person's is nothing of his, and his mood is the
 * day's reading and the night's question, not a chat's.
 */
export function toldRows(input: unknown, lines: ChatLine[]) {
  const list = (input as { facts?: unknown } | null)?.facts;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown) => {
    const [f] = parseFacts({ facts: [item] });
    const m = lines[Number((item as { mensaje?: unknown } | null)?.mensaje) - 1];
    if (!f || !m?.fromMe || (f.kind === "other" && isMood(f.data))) return [];
    const at = placeFact(m.at, { atSeconds: 0, clock: f.clock });
    const row = {
      waMessageId: m.id,
      kind: f.kind,
      at,
      day: localDay(at),
      summary: f.summary,
      data: f.data,
      evidence: f.evidence,
      confidence: f.confidence,
      model: DEFAULT_MODEL,
      promptVersion: TOLD_VERSION,
    };
    return [{ fact: f, row }];
  });
}

/** A pass reads this many messages at most; the next starts where it stopped. */
const MAX_LINES = 300;

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** What he told in each chat he follows since its last pass. One chat failing never stops the others. */
export async function toldInFollowed(now: Date, chats: string[], names: Map<string, string>, errors: string[]) {
  let told = 0;
  for (const chat of chats) {
    try {
      told += await toldInChat(chat, names.get(chat) ?? "La otra persona", now);
    } catch (err) {
      errors.push(`told ${chat}: ${String(err).slice(0, 120)}`);
    }
  }
  return told;
}

/**
 * From the last message read (`sync_state` «whatsapp-facts <chat>», its
 * `lastSweptAt`), or from today the first time: the history before was not
 * told to be kept. The mark moves only once the pass is stored.
 */
async function toldInChat(chat: string, name: string, now: Date): Promise<number> {
  const source = `whatsapp-facts ${chat}`;
  const after = (await readSyncState(source))?.lastSweptAt;
  const lines: ChatLine[] = await db
    .select({
      id: waMessages.id,
      fromMe: waMessages.fromMe,
      at: waMessages.at,
      day: waMessages.day,
      type: waMessages.type,
      body: waMessages.body,
      seconds: waMessages.seconds,
      seen: waMessages.seen,
    })
    .from(waMessages)
    .where(and(eq(waMessages.chat, chat), after ? gt(waMessages.at, after) : gte(waMessages.day, localDay(now))))
    .orderBy(asc(waMessages.at))
    .limit(MAX_LINES);
  const last = lines.at(-1);
  if (!last) return 0;
  let told: ReturnType<typeof toldRows> = [];
  // Only her messages: nothing of his to read, no call.
  if (lines.some((l) => l.fromMe)) {
    const logged = await db
      .select({ at: facts.at, day: facts.day, summary: facts.summary })
      .from(facts)
      .where(inArray(facts.day, [...new Set(lines.map((l) => l.day))]))
      .orderBy(desc(facts.at))
      .limit(80);
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4_096,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            `Chat de WhatsApp con ${name}:`,
            transcript(lines, name),
            "",
            "Ya apuntado esos días (lo oyó la grabadora, lo mandó al chat de Pulso o salió de este chat):",
            ...(logged.length > 0 ? logged.reverse().map((f) => `- ${f.day} ${localClock(f.at)} ${f.summary}`) : ["- Nada."]),
          ].join("\n"),
        },
      ],
    });
    const call = message.content.find((c) => c.type === "tool_use");
    told = toldRows(call?.type === "tool_use" ? call.input : null, lines);
  }
  if (told.length > 0) {
    // Something new gets its kind, and its icon is drawn afterwards, as in the chat.
    const kinds = await Promise.all(told.map((t) => (t.fact.tipo ? ensureKind(t.fact.tipo) : null)));
    await db.insert(facts).values(
      told.map((t, i) => {
        const kind = kinds[i];
        return kind ? { ...t.row, data: { ...t.row.data, kind } } : t.row;
      }),
    );
    learnMovesLater(told.map((t) => t.fact));
  }
  await writeSyncState(source, { lastSweptAt: last.at });
  return told.length;
}
