import type { WaTone, WaTopic } from "~/db/schema";
import { addDays } from "~/lib/day";

/**
 * Does a tense day on WhatsApp cost him the next morning? Each read day's mood
 * (1 to 5) next to WHOOP's recovery and HRV the morning after, in three bands.
 * Never one conversation: the pattern, or nothing.
 */
export const MOOD_LABEL: Record<number, string> = {
  1: "Día malo",
  2: "Día tenso",
  3: "Día normal",
  4: "Buen día",
  5: "Muy buen día",
};

export const BANDS = ["tenso", "normal", "bueno"] as const;
export type Band = (typeof BANDS)[number];
export const BAND_LABEL: Record<Band, string> = { tenso: "Tenso o malo", normal: "Normal", bueno: "Bueno" };
export const bandOf = (mood: number): Band => (mood <= 2 ? "tenso" : mood >= 4 ? "bueno" : "normal");

export interface Morning {
  recovery: number | null;
  hrv: number | null;
}

export interface BandRow {
  band: Band;
  days: number;
  recovery: number | null;
  hrv: number | null;
}

export interface MoodPattern {
  rows: BandRow[];
  /** Days with a mood AND a morning after: what the averages stand on. */
  paired: number;
  /** Recovery points a tense day costs against the rest; null until there is enough. */
  gap: number | null;
  headline: string;
}

/** Under this many days on either side, an average is one bad night. */
export const MIN_DAYS = 3;
/** A gap this small is a normal week's swing, not a pattern. */
const MIN_GAP = 5;

const mean = (xs: number[]) => (xs.length === 0 ? null : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length));

export function moodPattern(days: { day: string; mood: number }[], mornings: Map<string, Morning>): MoodPattern {
  const paired = days.flatMap((d) => {
    const m = mornings.get(addDays(d.day, 1));
    return m && m.recovery !== null ? [{ band: bandOf(d.mood), recovery: m.recovery, hrv: m.hrv }] : [];
  });
  const rows = BANDS.map((band) => {
    const mine = paired.filter((p) => p.band === band);
    return {
      band,
      days: mine.length,
      recovery: mean(mine.map((p) => p.recovery)),
      hrv: mean(mine.flatMap((p) => (p.hrv === null ? [] : [p.hrv]))),
    };
  });

  const tense = paired.filter((p) => p.band === "tenso").map((p) => p.recovery);
  const rest = paired.filter((p) => p.band !== "tenso").map((p) => p.recovery);
  if (tense.length < MIN_DAYS || rest.length < MIN_DAYS) {
    return {
      rows,
      paired: paired.length,
      gap: null,
      headline: `Aún pocos días para ver un patrón: hacen falta ${MIN_DAYS} tensos y ${MIN_DAYS} del resto con WHOOP a la mañana siguiente.`,
    };
  }
  const gap = mean(rest)! - mean(tense)!;
  const headline =
    gap >= MIN_GAP
      ? `Tras un día tenso en WhatsApp amaneces con ${gap} puntos menos de recuperación.`
      : gap <= -MIN_GAP
        ? `Tras un día tenso amaneces incluso mejor: ${-gap} puntos más de recuperación.`
        : "Por ahora tus días tensos no se notan en la recuperación de la mañana siguiente.";
  return { rows, paired: paired.length, gap, headline };
}

export interface TopicRow {
  topic: WaTopic;
  chats: number;
  /** Of those, tense or bad, in %. */
  tense: number;
}

/** Under this many conversations, a topic's share is two bad days. */
export const MIN_TOPIC_CHATS = 5;

/**
 * Which topics come with tension: of his conversations about each, how many
 * were tense or bad. «Otros» says nothing he can act on, so it stays out, and
 * so does a topic with too few to tell.
 */
export function topicTension(days: { chats: { tone: WaTone; topic?: WaTopic | null }[] }[]): TopicRow[] {
  const count = new Map<WaTopic, { chats: number; tense: number }>();
  for (const c of days.flatMap((d) => d.chats)) {
    if (!c.topic || c.topic === "Otros") continue;
    const t = count.get(c.topic) ?? { chats: 0, tense: 0 };
    count.set(c.topic, { chats: t.chats + 1, tense: t.tense + (c.tone === "tensa" || c.tone === "mala" ? 1 : 0) });
  }
  return [...count]
    .filter(([, t]) => t.chats >= MIN_TOPIC_CHATS)
    .map(([topic, t]) => ({ topic, chats: t.chats, tense: Math.round((t.tense / t.chats) * 100) }))
    .sort((a, b) => b.tense - a.tense || b.chats - a.chats);
}
