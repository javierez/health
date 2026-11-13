import { addDays, localMinutes } from "~/lib/day";
import type { Day } from "./days";
import { strainTarget } from "./stats";

/**
 * WHOOP's weekly plan: a handful of goals over the last 7 days, each a ring
 * of days hit (or time gathered), and the share accomplished. The targets are
 * the ones Healthspan scores against, so hitting the plan is what moves the age.
 */
export interface Goal {
  label: string;
  /** Days hit, or minutes gathered for a weekly-time goal. */
  done: number;
  target: number;
  /** Weekly-time goals show `h:mm`; day goals show `5/7`. */
  time: boolean;
  /** One per day, oldest first: whether that day counted. Empty for time goals. */
  days: boolean[];
}

const DAY_GOALS: { label: string; target: number; hit: (d: Day) => boolean | null }[] = [
  { label: "8.000+ pasos", target: 7, hit: (d) => (d.steps === null ? null : d.steps >= 8000) },
  { label: "7 h 15+ de sueño", target: 7, hit: (d) => (d.night ? d.night.sleepMin >= 435 : null) },
  { label: "Regularidad 77 %+", target: 7, hit: (d) => (d.night?.consistency == null ? null : d.night.consistency >= 77) },
  {
    label: "Esfuerzo en el objetivo",
    target: 5,
    hit: (d) => {
      const t = strainTarget(d.recovery);
      return t === null || d.strain === null ? null : d.strain >= t.low && d.strain <= t.high + 1;
    },
  },
];

const TIME_GOALS: { label: string; target: number; minutes: (d: Day) => number }[] = [
  { label: "Zonas 1-3", target: 150, minutes: (d) => d.z13Min },
  { label: "Zonas 4-5", target: 30, minutes: (d) => d.z45Min },
  { label: "Fuerza", target: 40, minutes: (d) => d.strengthMin },
];

export function weeklyPlan(days: Day[], day: string): { goals: Goal[]; accomplished: number } {
  const week = Array.from({ length: 7 }, (_, i) => days.find((d) => d.day === addDays(day, i - 6)) ?? null);
  const goals: Goal[] = [
    ...DAY_GOALS.map((g) => {
      const hits = week.map((d) => (d ? g.hit(d) === true : false));
      return { label: g.label, done: hits.filter(Boolean).length, target: g.target, time: false, days: hits };
    }),
    ...TIME_GOALS.map((g) => ({ label: g.label, done: Math.round(week.reduce((a, d) => a + (d ? g.minutes(d) : 0), 0)), target: g.target, time: true, days: [] })),
  ];
  const accomplished = goals.reduce((a, g) => a + Math.min(1, g.done / g.target), 0) / goals.length;
  return { goals, accomplished: Math.round(accomplished * 100) };
}

export type SleepGoal = 100 | 85 | 70;
export const SLEEP_GOALS: { key: SleepGoal; label: string }[] = [
  { key: 100, label: "Al máximo" },
  { key: 85, label: "Rendir" },
  { key: 70, label: "Ir tirando" },
];

/**
 * Sleep Planner: when to be in bed tonight to wake at the usual hour having
 * slept the share of tonight's need the goal asks for. Tonight's need is the
 * last night's plus half of what it fell short (WHOOP's debt), and time in
 * bed allows for the usual minutes awake.
 */
export function bedtimePlan(days: Day[], day: string, goal: SleepGoal): { bed: number; wake: number; inBedMin: number; needMin: number } | null {
  const nights = days.filter((d) => d.day > addDays(day, -14) && d.day <= day).flatMap((d) => (d.night ? [d.night] : []));
  const last = nights.at(-1);
  if (!last) return null;
  const wakes = nights.map((n) => localMinutes(new Date(n.end))).sort((a, b) => a - b);
  const wake = wakes[Math.floor(wakes.length / 2)]!;
  const need = (last.neededMin ?? 461) - (last.debtMin ?? 0) + Math.max(0, (last.neededMin ?? 461) - last.sleepMin) * 0.5;
  const efficiency = nights.reduce((a, n) => a + (n.efficiency ?? 92), 0) / nights.length / 100;
  const inBedMin = Math.round((need * goal) / 100 / efficiency);
  return { bed: (((wake - inBedMin) % 1440) + 1440) % 1440, wake, inBedMin, needMin: Math.round(need) };
}
