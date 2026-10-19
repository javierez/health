import type { FactData, FactKind } from "~/db/schema";
import { addDays } from "~/lib/day";
import { amount, MEAL_NAMES } from "~/lib/food";
import { TOILET_SYMPTOMS } from "~/lib/toilet";

/**
 * Anything of his he wants to keep, in his own categories. Javier,
 * 18-oct-2026: «yo puedo meter… todo lo que yo quisiera y administrarlo en
 * categorías». An `other` fact carries its name, its category and, when said,
 * a value with its unit and a few tags: «Dolor de cabeza», «Síntomas», 6 «/10»,
 * [«sien»]. The fixed kinds keep a fixed category. Moved and renamed by chat
 * (`organizar`), never typed. Pure: the agent's context and «Datos» share it.
 */
export const FIXED_CATEGORY: Record<Exclude<FactKind, "other">, string> = {
  meal: "Comida",
  training: "Entreno",
  body: "Peso",
  medical: "Médico",
  toilet: "Baño",
};
export const NO_CATEGORY = "Otros";

const TRAINING: Record<string, string> = { gym: "Gimnasio", run: "Correr" };
const TOILET: Record<string, string> = { pee: "Pis", poo: "Caca" };

/** «Síntomas»: one capital, so «síntomas» and «Síntomas» are one category. */
export const tidy = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toLocaleUpperCase("es") + t.slice(1);
};

/**
 * His mood and his symptoms: asked every night, so they are there before he
 * logs anything, and compared like a night's sleep (`insights/outcomes.ts`).
 * Javier, 18-oct-2026: «estado de ánimo me parece muy importante… podríamos
 * ponerla por default. Y síntomas también».
 */
export const MOOD = "Ánimo";
export const SYMPTOMS = "Síntomas";
export const DEFAULT_CATEGORIES = [MOOD, SYMPTOMS];

const bare = (s?: string) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** «Ánimo», «estado de ánimo», filed under «Ánimo». */
export const isMood = (d: FactData) => bare(d.name).includes("animo") || bare(d.category).includes("animo");

/** His mood out of 10: «4/5» is 8; a figure he gave with no scale is out of 10. */
export function moodOf(d: FactData): number | null {
  if (!isMood(d) || d.value === undefined) return null;
  const scale = d.unit?.startsWith("/") ? Number(d.unit.slice(1)) : 10;
  const v = (d.value / scale) * 10;
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : null;
}

export interface MoodDay {
  day: string;
  /** What he told that day, out of 10, in order: several a day since 19-oct-2026. */
  said: number[];
  /** How his WhatsApp read that day, 1 to 5 as out of 10: next to what he says. */
  chats: number | null;
}

/** The last `days` days up to today, oldest first: «Datos → Lo que apuntas → Ánimo». */
export function moodDays(said: { day: string; value: number }[], chats: { day: string; mood: number | null }[], today: string, days = 30): MoodDay[] {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    const read = chats.find((c) => c.day === day)?.mood;
    return { day, said: said.filter((s) => s.day === day).map((s) => s.value), chats: read ? read * 2 : null };
  });
}

const TOILET_WORD: Record<string, string> = { pee: "Pis", poo: "Caca" };

/** The symptoms in a fact, by name: one he filed in «Síntomas», or how a pee went. (A symptom Pocket heard is a sentence, never the same twice: left out.) */
export function symptomsOf(kind: FactKind, d: FactData, summary: string): string[] {
  if (kind === "other" && bare(d.category).includes("sintoma")) return [placeOf(kind, d, summary).name];
  if (kind === "toilet") return (d.symptoms ?? []).map((x) => `${TOILET_WORD[d.toilet ?? ""] ?? "Baño"} con ${TOILET_SYMPTOMS[x]}`);
  return [];
}

/** Where a fact goes and what it is called there. */
export function placeOf(kind: FactKind, data: FactData, summary: string): { category: string; name: string } {
  // Before names were kept, the summary's head was the name: «Meditar: 10 min».
  const named = data.name ?? summary.split(": ")[0] ?? summary;
  switch (kind) {
    case "other":
      return { category: data.category ?? NO_CATEGORY, name: named };
    case "meal":
      return { category: FIXED_CATEGORY.meal, name: MEAL_NAMES[data.meal ?? ""] ?? "Comida" };
    case "training":
      return { category: FIXED_CATEGORY.training, name: data.name ?? TRAINING[data.training ?? ""] ?? "Otro entreno" };
    case "toilet":
      return { category: FIXED_CATEGORY.toilet, name: TOILET[data.toilet ?? ""] ?? "Baño" };
    default:
      return { category: FIXED_CATEGORY[kind], name: FIXED_CATEGORY[kind] };
  }
}

/** «6/10», «2 L», «20 min», «3»: a value as it reads. */
export function valueText(value?: number, unit?: string): string {
  if (value === undefined) return "";
  if (!unit) return amount(value);
  return unit.startsWith("/") ? `${amount(value)}${unit}` : `${amount(value)} ${unit}`;
}

export interface Logged {
  kind: FactKind;
  day: string;
  summary: string;
  data: FactData;
}

export interface TrackedType {
  name: string;
  times: number;
  /** YYYY-MM-DD of the last one. */
  last: string;
  /** The last one's value, «6/10»; empty without one. */
  lastValue: string;
}

export interface TrackedCategory {
  category: string;
  /** His own (from `other`), not one of the fixed kinds. */
  own: boolean;
  times: number;
  types: TrackedType[];
}

/** Category by category, most used first; inside, each type with how often and the last time. Newest first in. */
export function byCategory(rows: Logged[]): TrackedCategory[] {
  const cats = new Map<string, TrackedCategory>();
  for (const r of rows) {
    const { category, name } = placeOf(r.kind, r.data, r.summary);
    const cat = cats.get(category.toLowerCase()) ?? { category, own: r.kind === "other", times: 0, types: [] };
    cats.set(category.toLowerCase(), cat);
    cat.times += 1;
    const type = cat.types.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (type) type.times += 1;
    else cat.types.push({ name, times: 1, last: r.day, lastValue: valueText(r.data.value, r.data.unit) });
  }
  const list = [...cats.values()];
  for (const c of list) c.types.sort((a, b) => b.times - a.times);
  return list.sort((a, b) => b.times - a.times);
}
