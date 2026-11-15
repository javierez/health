import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { FACT_KINDS, type FactData, type FactKind } from "~/db/schema";
import { env } from "~/env";
import { localMinutes } from "~/lib/day";
import { totals, type Food } from "~/lib/food";
import { FEELS, TOILET_SYMPTOMS, type ToiletSymptom } from "~/lib/toilet";
import { sinRayas } from "~/lib/sin-rayas";
import { tidy } from "~/lib/trackers";
import {
  DEFAULT_MODEL,
  planWindows,
  renderTranscript,
  type ExtractInput,
  type Window,
} from "./episodes";

/**
 * The second read of a recording: not "what was this stretch about" but "what
 * happened to the body" — a meal, a training session, something medical.
 *
 * 🚨 Nothing is typed by hand in this app. If a meal is not here it was not
 * said within earshot of the Pocket, and the screen says so rather than
 * guessing. That is why every fact carries the quote it came from.
 *
 * Same 45-minute windows as the episodes, for the same reason: past an hour
 * the model stops reading without saying so.
 *
 * Bump on any prompt or schema change; recordings with an older version are
 * read again by the next sweep.
 */
export const FACTS_VERSION = "facts-v1";

const MAX_CHARS = 90_000;

const SYSTEM = `You read the transcript of an audio recording made by a recorder Javier wears all day. Extract the facts about HIS body: what he ate or drank, the training he did, and anything medical about him.

Record only what actually happened to Javier, in this recording or told about earlier today:
- meal: he eats or drinks, or says what he ate. Not food merely talked about (a recipe, a menu, a restaurant to try), not what someone else ate. A coffee or a beer on its own is a meal of type "drink". ONE meal is ONE fact, however many minutes it is talked about: put every dish of it in items. Always fill meal, items, alcohol and caffeine.
- training: he trains or says he trained: gym, a run, a class, a match. List the exercises you can hear with sets, reps and kilos when said. A run with its distance when said. Always fill training.
- medical: a symptom he has, a medication he takes, a diagnosis, a doctor's or nurse's appointment, an instruction he was given (fasting, stop a medication, rest), a test result. Doctors' words count: write what they told him. Always fill medical.

When Javier is the one advising someone else (how to train, what to take, a friend's knee), that is about the other person: it is not a fact about him.

Fields:
- at_seconds: the offset where the evidence is, on the [mm:ss] scale of the transcript.
- clock: "HH:MM" only when he says when it happened ("he desayunado a las 8"). Otherwise omit it.
- summary: one short line in Spanish, what you would write in your own diary, with no subject. "Comida: lentejas, pan y un yogur". "Margarita en un restaurante". "Gimnasio: sentadilla 4×8 a 80 kg, press banca 3×10". "La anestesista dice que ayune 8 horas antes de la operación". No dashes.
- evidence: the exact words from the transcript, at most 160 characters.
- confidence: 0 to 1. Below 0.5 means you are inferring it from context.

When the recording has none of this, return an empty list. Do not invent a meal to fill a lunchtime recording.`;

/**
 * What a fact is, field by field. Shared with the chat (`~/server/agent/tools`),
 * which reads the same facts out of photos and videos.
 */
export const FACT_FIELDS = {
  clock: { type: "string", description: "HH:MM, only when said." },
  summary: { type: "string" },
  meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack", "drink"] },
  items: { type: "array", items: { type: "string" } },
  alcohol: { type: "boolean" },
  caffeine: { type: "boolean" },
  training: { type: "string", enum: ["gym", "run", "other"] },
  exercises: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        sets: { type: "number" },
        reps: { type: "number" },
        weight_kg: { type: "number" },
        seconds: { type: "number", description: "Held still (wall sit, plank): how long, with no reps." },
      },
      required: ["name"],
    },
  },
  distance_km: { type: "number" },
  medical: {
    type: "string",
    enum: ["symptom", "medication", "diagnosis", "appointment", "instruction", "test"],
  },
  evidence: { type: "string" },
  confidence: { type: "number", minimum: 0, maximum: 1 },
} as const;

/**
 * What he tells or shows, beyond what a recording is read for: a meal food by
 * food, his weight, the toilet, anything else he keeps. Shared by the chat
 * (`~/server/agent/tools`) and the WhatsApp chats he follows
 * (`~/server/evolution/told`).
 */
export const TOLD_FIELDS = {
  kcal: { type: "number" },
  protein_g: { type: "number" },
  water_ml: { type: "number", description: "En una comida o bebida, los ml de agua que se bebe (sola o con gas): un vaso 250, una botella 500 si no dice otra." },
  foods: {
    type: "array",
    description: "En una comida, cada alimento con sus gramos y lo que aporta. Lo que no lleve, sin poner.",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        grams: { type: "number" },
        kcal: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        sugar_g: { type: "number" },
        fiber_g: { type: "number" },
        fat_g: { type: "number" },
        sat_fat_g: { type: "number" },
        alcohol_g: { type: "number" },
        caffeine_mg: { type: "number" },
        salt_g: { type: "number" },
      },
      required: ["name"],
    },
  },
  weight_kg: { type: "number" },
  body_fat_pct: { type: "number" },
  toilet: { type: "string", enum: ["pee", "poo"] },
  feel: { type: "string", enum: Object.keys(FEELS) },
  bristol: { type: "number", minimum: 1, maximum: 7 },
  duration_min: { type: "number", description: "En el baño: cuánto ha tardado, si lo dice." },
  symptoms: { type: "array", items: { type: "string", enum: Object.keys(TOILET_SYMPTOMS) } },
  tipo: { type: "string", description: "Qué es, en una o dos palabras, si no es comida, gimnasio, correr ni bici: Yoga, Natación, Meditar, Dolor de cabeza." },
  categoria: { type: "string", description: "En other: una de las suyas de «Lo que apunta», con su nombre exacto, o una nueva corta." },
  valor: { type: "number", description: "En other, la cifra si la hay: 6 (de 10), 2 (litros), 20 (minutos)." },
  unidad: { type: "string", description: "La del valor: /10, L, min, veces." },
  etiquetas: { type: "array", items: { type: "string" }, description: "En other, dos o tres palabras de detalle si las dice: sien, tras comer." },
  estado: { type: "boolean", description: "En other, true si es algo que le pasa o cómo está (un dolor, el ánimo), no algo que hace." },
} as const;

const TOOL: Anthropic.Tool = {
  name: "record_facts",
  description: "Record the meals, training and medical facts about Javier in this recording.",
  input_schema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            // Not FACT_KINDS: "body" comes only from the chat (a photo of the
            // scale), and widening this enum would change facts-v1.
            kind: { type: "string", enum: ["meal", "training", "medical"] },
            at_seconds: { type: "number" },
            ...FACT_FIELDS,
          },
          required: ["kind", "at_seconds", "summary", "evidence", "confidence"],
        },
      },
    },
    required: ["facts"],
  },
};

const num = z.coerce.number().optional().catch(undefined);
const amount = z.coerce.number().min(0).optional().catch(undefined);

/** One food of a meal, as the agent sends it (`foods` in apuntar). */
const rawFood = z.object({
  name: z.string().trim().min(1),
  grams: amount,
  kcal: amount,
  protein_g: amount,
  carbs_g: amount,
  sugar_g: amount,
  fiber_g: amount,
  fat_g: amount,
  sat_fat_g: amount,
  alcohol_g: amount,
  caffeine_mg: amount,
  salt_g: amount,
});

/** A bad food drops that food, not the meal. */
function parseFoods(input: unknown): Food[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const foods = input.flatMap((x): Food[] => {
    const f = rawFood.safeParse(x);
    if (!f.success) return [];
    const v = f.data;
    return [
      {
        name: v.name,
        grams: v.grams,
        kcal: v.kcal,
        proteinG: v.protein_g,
        carbsG: v.carbs_g,
        sugarG: v.sugar_g,
        fiberG: v.fiber_g,
        fatG: v.fat_g,
        satFatG: v.sat_fat_g,
        alcoholG: v.alcohol_g,
        caffeineMg: v.caffeine_mg,
        saltG: v.salt_g,
      },
    ];
  });
  return foods.length > 0 ? foods : undefined;
}

const rawFact = z.object({
  kind: z.enum(FACT_KINDS),
  at_seconds: z.coerce.number().catch(0),
  clock: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional()
    .catch(undefined),
  summary: z.string().min(1),
  meal: z.string().optional(),
  items: z.array(z.string()).optional().catch(undefined),
  alcohol: z.boolean().optional().catch(undefined),
  caffeine: z.boolean().optional().catch(undefined),
  training: z.string().optional(),
  exercises: z
    .array(z.object({ name: z.string(), sets: num, reps: num, weight_kg: num, seconds: num }))
    .optional()
    .catch(undefined),
  distance_km: num,
  medical: z.string().optional(),
  kcal: num,
  protein_g: num,
  water_ml: z.coerce.number().positive().max(5000).optional().catch(undefined),
  foods: z.unknown().optional(),
  like: z.coerce.number().int().positive().optional().catch(undefined),
  rutina: z.coerce.number().int().positive().optional().catch(undefined),
  weight_kg: num,
  body_fat_pct: num,
  tipo: z.string().trim().min(1).max(40).optional().catch(undefined),
  categoria: z.string().trim().min(1).max(30).optional().catch(undefined),
  valor: num,
  unidad: z.string().trim().min(1).max(12).optional().catch(undefined),
  etiquetas: z.array(z.string().trim().min(1).max(30)).max(5).optional().catch(undefined),
  estado: z.boolean().optional().catch(undefined),
  toilet: z.enum(["pee", "poo"]).optional().catch(undefined),
  feel: z.enum(Object.keys(FEELS) as [keyof typeof FEELS]).optional().catch(undefined),
  bristol: z.coerce.number().int().min(1).max(7).optional().catch(undefined),
  duration_min: z.coerce.number().positive().max(180).optional().catch(undefined),
  symptoms: z.array(z.string()).optional().catch(undefined),
  evidence: z.string().optional().catch(undefined),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
});

export interface FactOutput {
  kind: FactKind;
  atSeconds: number;
  clock: string | null;
  summary: string;
  data: FactData;
  /** What it is when it is something new, as he said it: «Yoga», «Meditar». */
  tipo: string | null;
  /** «Lo de siempre»: the [id] of a meal to copy food by food (`withFoods`). */
  like: number | null;
  evidence: string | null;
  confidence: number;
}

/**
 * Below this the model is guessing. Measured on three real recordings
 * (16-oct-2026): the right facts came back at 0.7–0.8, the two wrong ones (a
 * session only planned, a friend's basketball practice) at 0.4 and 0.5.
 */
const MIN_CONFIDENCE = 0.6;

/**
 * One bad item drops that item, not the recording. The episodes learned this
 * the hard way: a strict schema lost two whole recordings to one stray field.
 */
export function parseFacts(input: unknown): FactOutput[] {
  const list = (input as { facts?: unknown } | null)?.facts;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const f = rawFact.safeParse(item);
    if (!f.success || f.data.confidence < MIN_CONFIDENCE) return [];
    const v = f.data;
    // A toilet time that is neither pee nor poo says nothing.
    if (v.kind === "toilet" && !v.toilet) return [];
    const data: FactData = {};
    if (v.kind === "meal") {
      data.meal = v.meal;
      data.items = v.items;
      data.alcohol = v.alcohol;
      data.caffeine = v.caffeine;
      data.kcal = v.kcal;
      data.proteinG = v.protein_g;
      data.waterMl = v.water_ml === undefined ? undefined : Math.round(v.water_ml);
      const foods = parseFoods(v.foods);
      if (foods) Object.assign(data, withFoods(data, foods));
    }
    if (v.kind === "training") {
      data.training = v.training;
      data.exercises = v.exercises?.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weightKg: e.weight_kg,
        seconds: e.seconds,
      }));
      data.routineId = v.rutina;
      data.distanceKm = v.distance_km;
      data.name = v.tipo;
    }
    if (v.kind === "other") {
      data.name = v.tipo;
      data.category = v.categoria ? tidy(v.categoria) : undefined;
      data.value = v.valor;
      data.unit = v.valor !== undefined ? v.unidad : undefined;
      data.tags = v.etiquetas?.length ? v.etiquetas : undefined;
      data.state = v.estado || undefined;
    }
    if (v.kind === "medical") data.medical = v.medical;
    if (v.kind === "body") {
      data.weightKg = v.weight_kg;
      data.bodyFatPct = v.body_fat_pct;
    }
    if (v.kind === "toilet") {
      data.toilet = v.toilet;
      data.feel = v.feel;
      if (v.toilet === "poo") data.bristol = v.bristol;
      data.durationMin = v.duration_min;
      const known = v.symptoms?.filter((s): s is ToiletSymptom => s in TOILET_SYMPTOMS);
      if (known?.length) data.symptoms = known;
    }
    return [
      {
        kind: v.kind,
        atSeconds: Math.max(0, Math.round(v.at_seconds)),
        clock: v.clock ?? null,
        summary: sinRayas(v.summary.trim()),
        data,
        tipo: v.tipo ?? null,
        like: v.kind === "meal" ? (v.like ?? null) : null,
        evidence: v.evidence?.slice(0, 200) ?? null,
        confidence: v.confidence,
      },
    ];
  });
}

/**
 * A meal with these foods: food by food wins, so its figures are what the
 * foods add up to. A drink or a coffee in them makes it one.
 */
export function withFoods(data: FactData, foods: Food[]): FactData {
  const t = totals(foods);
  return {
    ...data,
    foods,
    items: data.items ?? foods.map((f) => f.name),
    kcal: Math.round(t.kcal),
    proteinG: Math.round(t.proteinG),
    alcohol: (data.alcohol ?? false) || t.alcoholG > 0,
    caffeine: (data.caffeine ?? false) || t.caffeineMg > 0,
  };
}

/**
 * When it happened. The moment it was said, unless he said the time: then
 * that time, on the same day — or the day before when the time is later than
 * the moment it was said ("cené a las 22:00", said at 09:00).
 */
export function placeFact(recordedAt: Date, fact: Pick<FactOutput, "atSeconds" | "clock">): Date {
  const said = new Date(recordedAt.getTime() + fact.atSeconds * 1000);
  if (!fact.clock) return said;
  const [h, m] = fact.clock.split(":").map(Number);
  let delta = (h ?? 0) * 60 + (m ?? 0) - localMinutes(said);
  if (delta > 60) delta -= 1440;
  return new Date(said.getTime() + delta * 60_000);
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

function request(input: ExtractInput, window?: Window): string | null {
  const turns = window
    ? input.turns.filter((t) => (t.startSeconds ?? 0) >= window.start && (t.startSeconds ?? 0) < window.end)
    : input.turns;
  const body = renderTranscript(turns, window ? null : input.transcript);
  if (body.trim().length === 0) return null;
  return [
    input.recordedAt ? `Recording started at ${input.recordedAt} (UTC).` : null,
    window ? `This is part ${window.index + 1} of ${window.count}; offsets are absolute.` : null,
    `\nTranscript:\n${body.slice(0, MAX_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function extractFacts(
  input: ExtractInput,
): Promise<{ ok: true; facts: FactOutput[]; model: string } | { ok: false; detail: string }> {
  const windows = planWindows(input);
  const prompts = (windows.length === 0 ? [request(input)] : windows.map((w) => request(input, w))).filter(
    (p): p is string => p !== null,
  );

  const out: FactOutput[] = [];
  for (const content of prompts) {
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4_096,
        system: SYSTEM,
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
    out.push(...parseFacts(block.input));
  }

  return { ok: true, facts: out, model: DEFAULT_MODEL };
}
