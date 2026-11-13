import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { db } from "~/db";
import { assistantMessages, type Recommendation } from "~/db/schema";
import { env } from "~/env";
import { localDay } from "~/lib/day";
import { sinRayas } from "~/lib/sin-rayas";
import { loadNights } from "~/server/assistant/context";
import { bandSilentSince } from "~/server/assistant/plan";
import { VOZ } from "~/server/assistant/voice";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { loadFindings } from "~/server/queries/findings";
import { loadProgress, progressLines } from "~/server/queries/progress";
import { loadWhoop } from "~/server/queries/whoop";

import { readingContext } from "./reading";

/**
 * The interpreter: once a week the AI reads everything health measures
 * (`reading.ts`) and draws the few conclusions that change what he does
 * (Javier, 21-oct-2026: «un intérprete que coja todos los datos y saque
 * conclusiones»). The engine has already done the arithmetic; the model
 * crosses it. Saved as an assistant message of kind «reading»: the WHOOP
 * screen shows it and the morning note and the chat read it.
 */
export const PROMPT_VERSION = "reading-v2";
export const READING = "reading";

const AREAS = ["sleep", "training", "food", "social", "work", "medical"] as const;

const SYSTEM = `Eres el intérprete de los datos de salud de Javier. Una vez por semana lees todo lo que mide su app: lo que el motor estadístico encontró que le sienta bien o mal (recuperación, sueño, VFC, pulso, ánimo, síntomas, código), cómo se ha movido su cuerpo en el último mes, los cinco números de longevidad con más evidencia, su Healthspan y sus semanas. Sacas las pocas conclusiones que le cambian lo que hace.

${VOZ}

Cómo concluyes:
- Cruza fuentes. Una conclusión vale más cuando la apoyan dos cosas: el motor dice que acostarse tarde le baja la recuperación y además su regularidad va en ±60 min.
- Cada conclusión lleva su número, sacado de lo que te paso. Si algo no está, no lo inventes.
- Lo «seguro» lo dices como seguro; lo «probable» o «por aclarar», como lo que es. Lo que «no le afecta» también es una conclusión cuando él cree que sí (el café, por ejemplo): dilo si libera algo.
- Lo «antes y después» de un suplemento (desde que lo toma contra las semanas antes) es más débil que días con y sin: en esas semanas cambió todo lo demás. Dilo así.
- Recomiendas solo sobre lo que puede elegir. Lo que le pasa (un domingo, un síntoma, un día tenso) acompaña a sus noches, no las causa.
- Primero lo que más le mueve la recuperación y la longevidad. Si algo va bien, una línea para que no lo cambie.
- No diagnosticas. Si un número del cuerpo se sale de lo suyo (oxígeno bajando, temperatura o respiración subiendo varias semanas), que lo consulte con su médico.
- Sin rayas largas ni medias.

summary: dos o tres frases, 350 caracteres como mucho: lo más importante de lo que dicen sus datos ahora.
conclusions: de 3 a 6, de la que más le cambia a la que menos. title en imperativo y corto, lo que tiene que hacer ("Acuéstate a la misma hora también el sábado"). detail: la conclusión con sus datos en una o dos frases, y al final entre paréntesis lo segura que es (seguro, probable, por aclarar). area: ${AREAS.join(", ")}.`;

const TOOL: Anthropic.Tool = {
  name: "concluir",
  description: "Lo que dicen todos sus datos, y qué hacer.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      conclusions: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          properties: { area: { type: "string", enum: [...AREAS] }, title: { type: "string" }, detail: { type: "string" } },
          required: ["area", "title", "detail"],
        },
      },
    },
    required: ["summary", "conclusions"],
  },
  cache_control: { type: "ephemeral" },
};

const conclusion = z.object({ area: z.enum(AREAS), title: z.string().trim().min(3), detail: z.string().trim().catch("") });

export function parseReading(input: unknown): { summary: string; items: Recommendation[] } {
  const o = (input ?? {}) as { summary?: unknown; conclusions?: unknown };
  const items = (Array.isArray(o.conclusions) ? o.conclusions : []).flatMap((c) => {
    const r = conclusion.safeParse(c);
    return r.success ? [{ area: r.data.area, title: sinRayas(r.data.title), detail: sinRayas(r.data.detail) }] : [];
  });
  return { summary: typeof o.summary === "string" ? sinRayas(o.summary).replace(/\s+/g, " ").trim() : "", items: items.slice(0, 6) };
}

/** Everything, in words: what goes after the cache cut. */
export async function interpretationContext(now = new Date()): Promise<string> {
  const [found, band, progress, nights] = await Promise.all([loadFindings(), loadWhoop(now), loadProgress(now), loadNights()]);
  // A silent band leaves this week's sleep and recovery as the last nights it sent: «18 %, 6h07» on 7-nov from 31-oct.
  const silent = bandSilentSince(nights, now);
  const weeks = silent
    ? [`- La banda no manda noches desde el ${localDay(silent)}: esta semana no hay sueño ni recuperación medidos. No concluyas nada de esta semana sobre ellos.`, ...progressLines(progress, ["sleep", "recovery"])]
    : progressLines(progress);
  return readingContext({ today: localDay(now), found, band, progress: weeks });
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** One call, a few cents. Re-running the same day replaces that day's reading. */
export async function interpret(now = new Date()): Promise<{ summary: string; items: Recommendation[]; errors: string[] }> {
  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2_000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: await interpretationContext(now) }],
    });
    const block = message.content.find((c) => c.type === "tool_use");
    const reading = parseReading(block?.type === "tool_use" ? block.input : null);
    if (!reading.summary || reading.items.length === 0) return { ...reading, errors: ["empty reading"] };
    const row = { body: reading.summary, items: reading.items, status: "saved", error: null };
    await db
      .insert(assistantMessages)
      .values({ kind: READING, day: localDay(now), ...row })
      .onConflictDoUpdate({ target: [assistantMessages.kind, assistantMessages.day], set: row });
    return { ...reading, errors: [] };
  } catch (err) {
    return { summary: "", items: [], errors: [err instanceof Error ? err.message : "Anthropic call failed"] };
  }
}
