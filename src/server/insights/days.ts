import type { WaChat, WaTone, WaTopic } from "~/db/schema";
import { addDays, localMinutes } from "~/lib/day";
import { complete, totals, type Food, type Totals } from "~/lib/food";

/**
 * One row per evening: what he did that day, and what came after (the night,
 * the next morning, the next day's code). Pure: `queries/findings.ts` reads
 * the rows, this lines them up. A measure is null when its source did not
 * cover that day, so a missing day never counts as a zero.
 */
export interface Day {
  /** The evening, `YYYY-MM-DD`. */
  day: string;
  /** 1 Monday … 7 Sunday. */
  weekday: number;

  // The night after it.
  /** Bedtime on one line from noon: 01:30 is 1530. */
  bed: number | null;
  slept: number | null;
  /** Nights under 6 h among this one and the two before, 0 to 3. */
  debt: number | null;

  // The next morning and the next day: what is measured.
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  nextLines: number | null;
  /** The mood he tells the next evening, 1 to 10. */
  nextMood: number | null;
  /** Any symptom the next day (see `symptom`). */
  nextSymptom: boolean | null;

  // That day.
  trained: boolean | null;
  strength: boolean | null;
  cardio: boolean | null;
  /** A workout that ended after 20:30. */
  lateWorkout: boolean | null;
  strain: number | null;
  /** His lines of code (added plus deleted). */
  lines: number | null;
  /** A commit of his between 00:00 and 06:00, after this evening. */
  lateCode: boolean | null;
  /** WhatsApp messages he sent, from 04:00 to 04:00. */
  sent: number | null;
  /** Of those, between 23:00 and 04:00. */
  lateSent: number | null;
  /** Chats he wrote in. */
  chats: number | null;
  /** Minutes from his last WhatsApp to bed; below zero, he wrote in bed. */
  phoneToBed: number | null;
  /** His WhatsApp chats and Pocket's conversations, read by AI: the tense ones and the topics. */
  tenseChats: number | null;
  topics: WaTopic[] | null;
  tenseTopics: WaTopic[] | null;
  /** Minutes of work and of social talk his Pocket heard. */
  business: number | null;
  social: number | null;
  /** From a meal he told the chat about; null on days he told nothing. */
  alcohol: boolean | null;
  caffeine: boolean | null;
  /** Coffee or another caffeine after 14:00; null on days he told nothing. */
  lateCaffeine: boolean | null;
  /** What he ate, added up: only on days with lunch and dinner told food by food (`complete`). */
  food: Totals | null;
  /** Minutes from his last meal to bed; only when he told his dinner. */
  lastMeal: number | null;
  /** The supplements he took that day, by name (before 18-oct-2026, also a food or drink saved as a product). Creams stay out: they do not move his pulse. */
  products: string[];
  /** His habits ticked off («Leer 20 min») and anything of his own he told («Meditar»), by name. */
  did: string[];
  /** The mood he told in the chat that evening, 1 to 10. */
  toldMood: number | null;
  /** The symptoms he told that day, by name: «Dolor de cabeza», «Escozor al orinar». */
  symptoms: string[];
  /** Any symptom that day. «None» needs an answer: false only on a day he gave his mood and told no symptom. */
  symptom: boolean | null;
  /** The day in words, lowercase: WhatsApp summary and lines, Pocket one-liners. For AI hypotheses. */
  text: string;
}

export interface Raw {
  /** Main sleeps, by the morning they end in. */
  sleeps: { morning: string; start: Date; slept: number | null }[];
  recoveries: { morning: string; recovery: number | null; hrv: number | null; rhr: number | null }[];
  strain: { day: string; strain: number | null }[];
  workouts: { day: string; end: Date; sport: string }[];
  /** His lines per local day, and the evenings followed by a commit before 06:00. */
  code: { day: string; lines: number }[];
  lateCode: string[];
  codeRange: [string, string] | null;
  whatsapp: { day: string; sent: number; late: number; chats: number; last: Date }[];
  whatsappRange: [string, string] | null;
  waDays: { day: string; mood: number | null; summary: string; chats: WaChat[] }[];
  pocket: { day: string; business: number; social: number; lines: string }[];
  pocketRange: [string, string] | null;
  /** Pocket's conversations read for tone, on WhatsApp's two lists. */
  talks: { day: string; tone: WaTone; topic: WaTopic | null }[];
  meals: { day: string; at: Date; meal?: string; alcohol: boolean; caffeine: boolean; foods?: Food[] }[];
  productUses: { day: string; name: string }[];
  /** Trainings told in the chat or heard by Pocket: gym · run · other. WHOOP misses some. */
  trainings: { day: string; training: string }[];
  did: { day: string; name: string }[];
  /** His mood told in the chat, out of 10. */
  moods: { day: string; value: number }[];
  symptoms: { day: string; name: string }[];
}

const STRENGTH = new Set(["weightlifting", "powerlifting", "functional-fitness"]);
const CARDIO = new Set(["running", "cycling", "spin", "swimming", "soccer", "padel", "race-walking", "skiing"]);

const inRange = (day: string, r: [string, string] | null) => r !== null && day >= r[0] && day <= r[1];
const weekdayOf = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function buildDays(raw: Raw, until: string): Day[] {
  const sleepBy = new Map(raw.sleeps.map((s) => [s.morning, s]));
  const recBy = new Map(raw.recoveries.map((r) => [r.morning, r]));
  const strainBy = new Map(raw.strain.map((s) => [s.day, s.strain]));
  const linesBy = new Map(raw.code.map((c) => [c.day, c.lines]));
  const lateCode = new Set(raw.lateCode);
  const waBy = new Map(raw.whatsapp.map((w) => [w.day, w]));
  const readBy = new Map(raw.waDays.map((w) => [w.day, w]));
  const pocketBy = new Map(raw.pocket.map((p) => [p.day, p]));
  const talksBy = groupBy(raw.talks, (t) => t.day);
  const workoutsBy = groupBy(raw.workouts, (w) => w.day);
  const mealsBy = groupBy(raw.meals, (m) => m.day);
  const usesBy = groupBy(raw.productUses, (u) => u.day);
  const toldBy = groupBy(raw.trainings, (t) => t.day);
  const didBy = groupBy(raw.did, (d) => d.day);
  const moodsBy = groupBy(raw.moods, (m) => m.day);
  const symptomsBy = groupBy(raw.symptoms, (s) => s.day);
  // Twice in a day is its average; one decimal, as it reads.
  const moodOn = (day: string) => {
    const ms = moodsBy.get(day);
    return ms ? Math.round((ms.reduce((t, m) => t + m.value, 0) / ms.length) * 10) / 10 : null;
  };
  const symptomOn = (day: string) => (symptomsBy.has(day) ? true : moodsBy.has(day) ? false : null);

  const firsts = [
    raw.recoveries.map((r) => addDays(r.morning, -1)),
    raw.codeRange ? [raw.codeRange[0]] : [],
    raw.whatsappRange ? [raw.whatsappRange[0]] : [],
  ].flat();
  if (firsts.length === 0) return [];
  const out: Day[] = [];
  for (let day = firsts.sort()[0]!; day < until; day = addDays(day, 1)) {
    const morning = addDays(day, 1);
    const sleep = sleepBy.get(morning);
    const rec = recBy.get(morning);
    // WHOOP covered the day if it scored the morning after: then no workout means none.
    const whoop = rec !== undefined;
    const workouts = workoutsBy.get(day) ?? [];
    const told = toldBy.get(day) ?? [];
    // A training he told counts even on a day WHOOP did not score; without either, unknown.
    const trainedIf = (whoopSaw: boolean, toldOne: boolean) => (toldOne ? true : whoop ? whoopSaw : null);
    const wa = waBy.get(day);
    const read = readBy.get(day);
    const pocket = pocketBy.get(day);
    const meals = mealsBy.get(day);
    const clock = sleep ? localMinutes(sleep.start) : null;
    const nights = [addDays(day, -1), day, morning].map((m) => sleepBy.get(m)?.slept ?? null);
    // His chats and what the Pocket heard: a tense call counts like a tense chat.
    const talks = read || talksBy.has(day) ? [...(read?.chats ?? []), ...(talksBy.get(day) ?? [])] : null;
    const tense = talks?.filter((c) => c.tone === "tensa" || c.tone === "mala") ?? null;
    out.push({
      day,
      weekday: weekdayOf(day),
      bed: clock === null ? null : clock < 12 * 60 ? clock + 1440 : clock,
      slept: sleep?.slept ?? null,
      debt: nights.every((n) => n !== null) ? nights.filter((n) => n! < 360).length : null,
      recovery: rec?.recovery ?? null,
      hrv: rec?.hrv ?? null,
      rhr: rec?.rhr ?? null,
      nextLines: inRange(morning, raw.codeRange) ? (linesBy.get(morning) ?? 0) : null,
      nextMood: moodOn(morning),
      nextSymptom: symptomOn(morning),
      trained: trainedIf(workouts.length > 0, told.length > 0),
      strength: trainedIf(workouts.some((w) => STRENGTH.has(w.sport)), told.some((t) => t.training === "gym")),
      cardio: trainedIf(workouts.some((w) => CARDIO.has(w.sport)), told.some((t) => t.training === "run")),
      lateWorkout: whoop ? workouts.some((w) => localMinutes(w.end) >= 20 * 60 + 30) : null,
      strain: strainBy.get(day) ?? null,
      lines: inRange(day, raw.codeRange) ? (linesBy.get(day) ?? 0) : null,
      lateCode: inRange(morning, raw.codeRange) ? lateCode.has(day) : null,
      sent: inRange(day, raw.whatsappRange) ? (wa?.sent ?? 0) : null,
      lateSent: inRange(day, raw.whatsappRange) ? (wa?.late ?? 0) : null,
      chats: inRange(day, raw.whatsappRange) ? (wa?.chats ?? 0) : null,
      phoneToBed: wa && sleep ? phoneToBed(wa.last, sleep.start) : null,
      tenseChats: tense?.length ?? null,
      topics: talks ? [...new Set(talks.flatMap((c) => (c.topic ? [c.topic] : [])))] : null,
      tenseTopics: tense ? [...new Set(tense.flatMap((c) => (c.topic ? [c.topic] : [])))] : null,
      business: inRange(day, raw.pocketRange) ? (pocket?.business ?? 0) : null,
      social: inRange(day, raw.pocketRange) ? (pocket?.social ?? 0) : null,
      alcohol: meals ? meals.some((m) => m.alcohol) : null,
      caffeine: meals ? meals.some((m) => m.caffeine) : null,
      lateCaffeine: meals ? meals.some((m) => m.caffeine && localMinutes(m.at) >= 14 * 60) : null,
      food: meals && complete(meals) ? totals(meals.flatMap((m) => m.foods ?? [])) : null,
      lastMeal: meals && sleep ? mealToBed(meals, sleep.start) : null,
      products: [...new Set((usesBy.get(day) ?? []).map((u) => u.name))],
      did: [...new Set((didBy.get(day) ?? []).map((d) => d.name))],
      toldMood: moodOn(day),
      symptoms: [...new Set((symptomsBy.get(day) ?? []).map((x) => x.name))],
      symptom: symptomOn(day),
      text: [read?.summary, ...(read?.chats.map((c) => `${c.name}: ${c.line}`) ?? []), pocket?.lines].filter(Boolean).join("\n").toLowerCase(),
    });
  }
  return out;
}

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const out = new Map<string, T[]>();
  for (const x of xs) out.set(key(x), [...(out.get(key(x)) ?? []), x]);
  return out;
}

/** A drink after dinner is not a meal; a dinner after bed is a wrong clock. */
function mealToBed(meals: Raw["meals"], bed: Date) {
  if (!meals.some((m) => m.meal === "dinner")) return null;
  const last = Math.max(...meals.filter((m) => m.meal !== "drink").map((m) => m.at.getTime()));
  const min = (bed.getTime() - last) / 60_000;
  return min >= 0 && min <= 600 ? Math.round(min) : null;
}

/** Only a message from the evening counts: one at noon says nothing about bedtime. */
function phoneToBed(last: Date, bed: Date) {
  const min = (bed.getTime() - last.getTime()) / 60_000;
  return min >= -120 && min <= 360 ? Math.round(min) : null;
}
