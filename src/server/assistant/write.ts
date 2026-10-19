import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { Recommendation } from "~/db/schema";
import { env } from "~/env";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { EVIDENCE_LINES } from "./evidence";
import { clock, type BedtimePlan, type MessageKind } from "./plan";
import { VOZ } from "./voice";

/**
 * WHAT the assistant says. The timing and the bedtime are already decided by
 * `plan.ts`; the model only turns them, and the context, into a few concrete
 * things to do: one WhatsApp paragraph and the same advice as a list, which is
 * what the top of the board shows.
 */
const SYSTEM = `Eres el asistente personal de salud de Javier. Le escribes por WhatsApp y le preparas la lista del día en su panel. Tienes sus datos de WHOOP, lo que se ha oído en sus grabaciones, lo que te ha mandado al chat (fotos de comida, la báscula, vídeos de entreno), cómo van sus semanas (sueño, entreno, peso, código y llamadas de trabajo) y su ficha médica.

${VOZ}

Qué dices:
- Solo cosas concretas que hacer, con hora o cantidad cuando se pueda. Nada de consejos genéricos.
- Mira la tendencia de las semanas antes que un día suelto: si lleva tres semanas durmiendo menos de lo que necesita, eso manda.
- Te basas solo en los datos que te paso. Si algo no está, no lo inventes.
- Lo médico, solo lo que está en su ficha o se le ha oído decir a un médico. No diagnosticas. Si algo preocupa (un síntoma que se repite, algo que choca con lo que le dijo el médico), le dices que lo consulte con su médico.
- Si hay una intervención o una prueba próxima en la ficha, cuenta los días y recuerda lo que toque preparar según lo que le dijeron.
- Si en su historia médica hay algo pendiente (una cita que pedir, una prueba sin volante), va primero.

Lo que dice la ciencia. Tus consejos de sueño, comida y entreno salen de aquí, con sus datos; cuando uses uno, pon la fuente corta al final del detail, entre paréntesis:
${EVIDENCE_LINES}

message: un solo párrafo, sin saltos de línea, sin listas, sin emojis, sin saludo ni despedida. Máximo 500 caracteres.
items: de 3 a 5 cosas que hacer hoy, de la más importante a la menos. title en imperativo y corto ("Entreno suave, 40 min de zona 2"); detail con el porqué en una línea, con su dato ("Recuperación 38 %, tercera semana por debajo de 50"). La hora de acostarse ya sale aparte en la lista: no la repitas ni pongas otra.`;

const TOOL: Anthropic.Tool = {
  name: "escribir",
  description: "El mensaje de WhatsApp y la lista de lo que toca hoy.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string", enum: ["sleep", "training", "food", "medical", "work"] },
            title: { type: "string" },
            detail: { type: "string" },
          },
          required: ["area", "title", "detail"],
        },
      },
    },
    required: ["message", "items"],
  },
  cache_control: { type: "ephemeral" },
};

const TASK: Record<MessageKind, (plan: BedtimePlan) => string> = {
  bedtime: (p) =>
    `Escribe el aviso de irse a dormir. Hora de acostarse: ${clock(p.bedMinutes)}, para dormir ${Math.floor(p.needMinutes / 60)} h ${p.needMinutes % 60} min y levantarse a las ${clock(p.wakeMinutes)}. Dile la hora y lo que tiene que hacer en la próxima media hora según lo que ha comido, bebido y entrenado hoy y lo que pide su ficha médica. Termina con una sola línea de preguntas, juntas, para apuntarlas: si en «Hoy lleva» no está la cena, qué ha cenado; si en «Hoy, ánimo» pone sin apuntar, qué tal el día del 1 al 10 y si ha tenido algún síntoma. Si ya está todo, sin preguntas. En items, lo de esta noche y mañana a primera hora.`,
  commitments: () => COMMITMENTS_TASK,
  morning: (p) =>
    `Escribe la nota de la mañana: cómo ha dormido y recuperado en una frase, cuánto entrenar hoy según la recuperación y sus compromisos de la semana (si hoy toca, en qué hueco de la agenda), qué comer y lo que su ficha médica pide hoy. Esta noche, a la cama a las ${clock(p.bedMinutes)}: si lo dices, esa hora y no otra. En items, la lista de hoy, sin la hora de acostarse.`,
};

const COMMITMENTS_TASK = `Escribe el aviso de la tarde sobre sus compromisos: va por detrás en alguno y hoy aún no ha entrenado. Lo que le queda y cuántos días, y si toca hoy o mejor otro día: con buena recuperación, hoy, en el hueco de la agenda que tenga; con la recuperación baja o mal dormido, algo suave hoy o el día con hueco que mejor le venga. Si ya no da para cumplirlo entero, dilo sin drama y propón lo que sí. En items, lo de hoy y mañana para cumplir.`;

const item = z.object({
  area: z.enum(["sleep", "training", "food", "medical", "work"]),
  title: z.string().min(1),
  detail: z.string().catch(""),
});

export function parseWritten(input: unknown): { text: string; items: Recommendation[] } {
  const o = (input ?? {}) as { message?: unknown; items?: unknown };
  // A template variable cannot carry a line break, a tab or a run of spaces:
  // Meta rejects the send. One clean paragraph, cut where Meta would.
  const text = typeof o.message === "string" ? sinRayas(o.message).replace(/\s+/g, " ").trim().slice(0, 700) : "";
  const items = (Array.isArray(o.items) ? o.items : []).flatMap((i) => {
    const r = item.safeParse(i);
    return r.success ? [{ area: r.data.area, title: sinRayas(r.data.title.trim()), detail: sinRayas(r.data.detail.trim()) }] : [];
  });
  return { text, items: items.slice(0, 5) };
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function writeMessage(
  kind: MessageKind,
  plan: BedtimePlan,
  context: string,
): Promise<{ ok: true; text: string; items: Recommendation[] } | { ok: false; detail: string }> {
  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1_200,
      // The rules and the tool are the fixed part, cached; his data changes
      // every time and goes after the cut.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `${context}\n\n${TASK[kind](plan)}` }],
    });
    const block = message.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") return { ok: false, detail: "no tool_use block" };
    const written = parseWritten(block.input);
    return written.text ? { ok: true, ...written } : { ok: false, detail: "empty reply" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Anthropic call failed" };
  }
}
