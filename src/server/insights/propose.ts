import Anthropic from "@anthropic-ai/sdk";
import { inArray, isNull } from "drizzle-orm";

import { db } from "~/db";
import { hypotheses } from "~/db/schema";
import { env } from "~/env";
import { sinRayas } from "~/lib/sin-rayas";
import { DEFAULT_MODEL } from "~/server/classify/episodes";
import { loadDays, loadFindings } from "~/server/queries/findings";

import { FIELDS, specSchema } from "./hypotheses";
import { OUTCOME_KEYS, OUTCOMES } from "./outcomes";

/**
 * Once a week the AI reads what the engine already found and the last three
 * weeks in words, and proposes up to three new splits to test. It proposes;
 * the engine decides (Javier, 18-oct-2026: «algunas con AI y otras sin AI»).
 * One call, its fixed part cached: a few cents.
 */
export const PROMPT_VERSION = "hypotheses-v1";
const MAX_LIVE = 12;

const SYSTEM = `Eres el analista de datos de salud de una sola persona. Tu trabajo es proponer hipótesis NUEVAS que comparar en sus propios datos: qué podría estar afectando a su recuperación, su sueño, su VFC, su pulso en reposo o lo que programa al día siguiente.

Cada hipótesis divide sus días en dos grupos con condiciones sobre estas medidas del día (y la noche que le sigue):
${Object.entries(FIELDS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
o sobre palabras que aparecen ese día en el resumen de su WhatsApp o en lo que oyó Pocket ("mentions": una persona, un sitio, un tema; en minúscula, tal como aparecería).

Reglas:
- Propón entre 1 y 3. Solo ideas que no estén ya en la lista de lo comparado.
- Las mejores combinan dos cosas ("entrenar tarde y además acostarse después de las 02:00") o usan palabras de sus días que se repiten (una persona, un proyecto, un sitio).
- Cada grupo tiene que poder juntar al menos 10 días: nada de casos raros.
- "versus": "rest" compara con todos los demás días; o pon condiciones para el grupo de comparación.
- title: en español, corto, como se lo dirías ("Días que hablas con Gonzalo de dinero").
- why: una frase, qué viste en sus días que te hace sospecharlo.
- good y bad: qué le recomendarías si resulta que le sienta bien, y si le sienta mal. Verbo "haz" o "evita" y la acción en minúscula, concreta.
- controllable: true si puede decidirlo cada día (para un experimento de dos semanas).
- No uses rayas largas ni medias.`;

const cond = {
  type: "object",
  properties: {
    field: { type: "string", enum: Object.keys(FIELDS) },
    op: { type: "string", enum: [">=", "<=", "="] },
    value: { type: "number" },
    mentions: { type: "string" },
  },
};
const todo = {
  type: "object",
  properties: { verb: { type: "string", enum: ["haz", "evita"] }, action: { type: "string" } },
  required: ["verb", "action"],
};

const TOOL: Anthropic.Tool = {
  name: "proponer",
  description: "Las hipótesis nuevas que comparar.",
  input_schema: {
    type: "object",
    properties: {
      hypotheses: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            // The same limits `specSchema` holds them to: on 1-nov-2026 a 200+ «why» threw one away.
            title: { type: "string", maxLength: 60 },
            why: { type: "string", maxLength: 200 },
            labels: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
            when: { type: "array", items: cond, minItems: 1, maxItems: 3 },
            versus: { anyOf: [{ type: "string", enum: ["rest"] }, { type: "array", items: cond, minItems: 1, maxItems: 3 }] },
            good: todo,
            bad: todo,
            controllable: { type: "boolean" },
          },
          required: ["title", "why", "labels", "when", "versus", "good", "bad", "controllable"],
        },
      },
    },
    required: ["hypotheses"],
  },
  cache_control: { type: "ephemeral" },
};

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** What changes every week, after the cache cut: the results so far and his days in words. */
export async function proposalContext(): Promise<string> {
  const [found, days, live] = await Promise.all([
    loadFindings(),
    loadDays(),
    db.select({ title: hypotheses.title }).from(hypotheses).where(isNull(hypotheses.retiredAt)),
  ]);
  const lines = OUTCOME_KEYS.map((o) => {
    const r = found.by[o];
    const show = (fs: typeof r.good) => fs.map((f) => `${f.title} (${f.big})`).join("; ") || "nada";
    return `${OUTCOMES[o].label}: le sienta bien ${show(r.good)}. Mal: ${show(r.bad)}. Por aclarar: ${show(r.unclear)}.`;
  });
  const tested = [...new Set(OUTCOME_KEYS.flatMap((o) => Object.values(found.by[o]).flat().map((f) => f.title)))];
  const words = days
    .slice(-21)
    .filter((d) => d.text)
    .map((d) => `${d.day}: ${d.text.slice(0, 600)}`)
    .join("\n");
  return [
    `Resultados con ${found.nights} noches:`,
    ...lines,
    "",
    `Ya comparado: ${tested.join("; ")}.`,
    `Sin datos aún: ${found.waiting.join("; ") || "nada"}.`,
    `Hipótesis tuyas en marcha: ${live.map((h) => h.title).join("; ") || "ninguna"}.`,
    "",
    "Sus últimos días en palabras:",
    words || "(sin texto)",
  ].join("\n");
}

export async function proposeHypotheses(): Promise<{ added: string[]; errors: string[] }> {
  const errors: string[] = [];
  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2_000,
      // The rules and the tool are the fixed part, cached; the week goes after the cut.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: await proposalContext() }],
    });
    const block = message.content.find((c) => c.type === "tool_use");
    const list = block?.type === "tool_use" ? (block.input as { hypotheses?: unknown[] }).hypotheses : undefined;
    const added: string[] = [];
    for (const h of Array.isArray(list) ? list : []) {
      const spec = specSchema.safeParse(h);
      if (!spec.success) {
        errors.push(`spec: ${spec.error.issues[0]?.message ?? "invalid"}`);
        continue;
      }
      const clean = { ...spec.data, title: sinRayas(spec.data.title), why: sinRayas(spec.data.why) };
      await db.insert(hypotheses).values({ title: clean.title, why: clean.why, spec: clean, model: DEFAULT_MODEL, promptVersion: PROMPT_VERSION });
      added.push(clean.title);
    }
    await retireOldest();
    return { added, errors };
  } catch (err) {
    return { added: [], errors: [err instanceof Error ? err.message : "Anthropic call failed"] };
  }
}

/** Twelve live at most: the oldest go first. */
async function retireOldest() {
  const live = await db.select({ id: hypotheses.id }).from(hypotheses).where(isNull(hypotheses.retiredAt)).orderBy(hypotheses.createdAt);
  const old = live.slice(0, Math.max(0, live.length - MAX_LIVE)).map((h) => h.id);
  if (old.length > 0) await db.update(hypotheses).set({ retiredAt: new Date() }).where(inArray(hypotheses.id, old));
}
