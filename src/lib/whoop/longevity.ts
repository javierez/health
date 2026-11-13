import { addDays, localMinutes } from "~/lib/day";
import type { Day } from "./days";
import { pillarValues, vo2Estimate } from "./healthspan";

/**
 * The five charts with the most evidence for living longer and better
 * (Javier, 20-oct-2026: «un top 5… las que más evidencia científica tengan»),
 * each from what health already has: VO₂max, weekly exercise, steps, time
 * with his people (Pocket) and sleep regularity. Pure: the screen draws these.
 */

/** A rolling week ending `weeksAgo` weeks before `day`: no half-weeks at the edge. */
const week = (day: string, weeksAgo: number) => ({ from: addDays(day, -7 * weeksAgo - 6), to: addDays(day, -7 * weeksAgo) });
const inWeek = (d: string, w: { from: string; to: string }) => d >= w.from && d <= w.to;
const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Uth's ratio with 15.3, and with 14 for the cautious edge of the band: it overestimates outside trained men. */
export interface Vo2Month {
  month: string;
  high: number;
  low: number;
}

export function vo2Months(days: Day[], maxHr: number | null, months = 12): Vo2Month[] {
  if (!maxHr) return [];
  const by = new Map<string, number[]>();
  for (const d of days) if (d.rhr !== null) by.set(d.day.slice(0, 7), [...(by.get(d.day.slice(0, 7)) ?? []), d.rhr]);
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .flatMap(([month, rhrs]) => {
      const rhr = avg(rhrs)!;
      return [{ month, high: vo2Estimate(maxHr, rhr)!, low: (14 * maxHr) / rhr }];
    });
}

export interface ExerciseWeek {
  from: string;
  moderate: number;
  vigorous: number;
  strength: number;
}

/** Zones 1-3 as moderate and 4-5 as vigorous (Lee 2022's two doses), strength apart (Momma 2022). */
export function exerciseWeeks(days: Day[], day: string, n = 8): ExerciseWeek[] {
  return Array.from({ length: n }, (_, i) => {
    const w = week(day, n - 1 - i);
    const xs = days.filter((d) => inWeek(d.day, w));
    const sum = (f: (d: Day) => number) => Math.round(xs.reduce((a, d) => a + f(d), 0));
    return { from: w.from, moderate: sum((d) => d.z13Min), vigorous: sum((d) => d.z45Min), strength: sum((d) => d.strengthMin) };
  });
}

/** WHO counts a vigorous minute as two moderate: 150 is the floor either way. */
export const cardioMinutes = (w: ExerciseWeek) => w.moderate + 2 * w.vigorous;

/** Under 1,000 steps the band was off, not him on the sofa. */
const WORN = 1000;
export const STEP_GOAL = 8000;

export function stepDays(days: Day[], day: string, span = 30): { day: string; steps: number }[] {
  return days.flatMap((d) => (d.day > addDays(day, -span) && d.day <= day && d.steps !== null && d.steps >= WORN ? [{ day: d.day, steps: d.steps }] : []));
}

/** Who a Pocket stretch was with, folded into the three that matter here. */
export const SOCIAL_GROUPS = [
  { key: "family", label: "Pareja y familia", counterparts: ["family"] },
  { key: "friend", label: "Amigos", counterparts: ["friend"] },
  { key: "work", label: "Trabajo", counterparts: ["colleague", "client", "partner"] },
] as const;
export type SocialGroup = (typeof SOCIAL_GROUPS)[number]["key"];

export interface Spoken {
  day: string;
  counterpart: string;
  minutes: number;
}
export interface SocialWeek {
  from: string;
  hours: Record<SocialGroup, number>;
}

/** Hours heard by the Pocket per week; a week it heard nothing is left out, not counted as alone. */
export function socialWeeks(rows: Spoken[], day: string, n = 9): SocialWeek[] {
  return Array.from({ length: n }, (_, i) => week(day, n - 1 - i)).flatMap((w) => {
    const xs = rows.filter((r) => inWeek(r.day, w));
    if (xs.length === 0) return [];
    const hours = (g: (typeof SOCIAL_GROUPS)[number]) => xs.filter((r) => (g.counterparts as readonly string[]).includes(r.counterpart)).reduce((a, r) => a + r.minutes, 0) / 60;
    return [{ from: w.from, hours: { family: hours(SOCIAL_GROUPS[0]), friend: hours(SOCIAL_GROUPS[1]), work: hours(SOCIAL_GROUPS[2]) } }];
  });
}

/** Bed after midnight stays after midnight: 23:30 is −30, so it sits next to 00:40 and not at the far end. */
const bedClock = (ms: number) => {
  const m = localMinutes(new Date(ms));
  return m > 720 ? m - 1440 : m;
};

export interface Regularity {
  /** Spread of bed and wake times (SD, minutes), as Healthspan scores it. */
  sd: number | null;
  nights: { day: string; bed: number; wake: number }[];
}

export function regularity(days: Day[], day: string, span = 63): Regularity {
  const nights = days.flatMap((d) =>
    d.day > addDays(day, -span) && d.day <= day && d.night ? [{ day: d.day, bed: bedClock(d.night.start), wake: localMinutes(new Date(d.night.end)) }] : [],
  );
  return { sd: pillarValues(days, day, span, null).regularity ?? null, nights };
}
