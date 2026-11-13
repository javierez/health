import { addDays, localMinutes } from "~/lib/day";
import type { Day } from "./days";

/**
 * Healthspan, WHOOP Age and Pace of Aging. WHOOP's formula is its own; this is
 * OpenStrap Edge's open one (`lib/compute/healthspan.dart`), ported: each habit
 * is a hazard ratio from a meta-analysis, and mortality doubles about every
 * 8 years, so a habit with hazard HR against the reference adult moves the age
 * by ln(HR) / ln 2 × 8 years. Inputs overlap, so the sum keeps 60 %, capped at ±12.
 */
const YEARS_PER_LN_HAZARD = 8 / Math.LN2;
const OVERLAP = 0.6;
const MAX_DELTA = 12;
const MIN_INPUTS = 4;
const MIN_DAYS = 10;
export const WINDOW = 30;

/** Liu 2017: flat 7–8 h, 1.06 per hour short, 1.13 per hour long. */
const sleepHazard = (h: number) => (h < 7 ? 1.06 ** (7 - h) : h > 8 ? 1.13 ** (h - 8) : 1);
/** Bed and wake spread (SD, min): free to 30, 1.10 per extra 30, capped at Windred's 1.5. */
const regularityHazard = (sd: number) => Math.min(1.5, 1.1 ** (Math.max(0, sd - 30) / 30));
/** Lee 2022 moderate: 0.80 at 150 min/week, 0.75 from 300. */
const moderateHazard = (m: number) => (m <= 150 ? 1 - (0.2 * Math.max(0, m)) / 150 : 0.8 - 0.05 * Math.min(1, (m - 150) / 150));
/** Lee 2022 vigorous: 0.80 at 75 min/week, 0.77 from 150. */
const vigorousHazard = (m: number) => (m <= 75 ? 1 - (0.2 * Math.max(0, m)) / 75 : 0.8 - 0.03 * Math.min(1, (m - 75) / 75));
/** Momma 2022: 0.83 at 40 min/week, flat after. */
const strengthHazard = (m: number) => 1 - 0.17 * Math.min(1, Math.max(0, m) / 40);
/** Paluch 2022: log-linear from 3,500 steps to 12,000. */
const stepsHazard = (s: number) => (Math.min(12000, Math.max(3500, s)) / 3500) ** -0.65;
/** Zhang 2016: 1.09 per 10 bpm. */
const rhrHazard = (b: number) => 1.09 ** (b / 10);
/** Kodama 2009: 0.87 per MET. */
const vo2Hazard = (v: number) => 0.87 ** (v / 3.5);
/** FRIEND registry, men. */
const referenceVo2 = (age: number) => 48 - 0.42 * (age - 25);

export type PillarKey = "sleep" | "regularity" | "z13" | "z45" | "strength" | "steps" | "rhr" | "vo2";
export interface Pillar {
  key: PillarKey;
  group: "Sueño" | "Esfuerzo" | "Forma física";
  label: string;
  unit: string;
  /** Where the bar starts (worse) and ends (better), and the reference adult. */
  worse: number;
  better: number;
  reference: number;
  hazard: (v: number) => number;
}

export const PILLARS: Pillar[] = [
  { key: "sleep", group: "Sueño", label: "Horas de sueño", unit: "h", worse: 5, better: 8, reference: 7.5, hazard: sleepHazard },
  { key: "regularity", group: "Sueño", label: "Regularidad (desviación de horario)", unit: "min", worse: 90, better: 15, reference: 45, hazard: regularityHazard },
  { key: "z13", group: "Esfuerzo", label: "Zonas 1-3 a la semana", unit: "h", worse: 0, better: 3, reference: 2, hazard: (h) => moderateHazard(h * 60) },
  { key: "z45", group: "Esfuerzo", label: "Zonas 4-5 a la semana", unit: "h", worse: 0, better: 1, reference: 0.5, hazard: (h) => vigorousHazard(h * 60) },
  { key: "strength", group: "Esfuerzo", label: "Fuerza a la semana", unit: "h", worse: 0, better: 4, reference: 0, hazard: (h) => strengthHazard(h * 60) },
  { key: "steps", group: "Esfuerzo", label: "Pasos al día", unit: "", worse: 0, better: 16000, reference: 6000, hazard: stepsHazard },
  { key: "rhr", group: "Forma física", label: "Pulso en reposo", unit: "lpm", worse: 80, better: 45, reference: 68, hazard: rhrHazard },
  { key: "vo2", group: "Forma física", label: "VO₂ máx. estimado", unit: "ml/kg/min", worse: 30, better: 60, reference: 44, hazard: vo2Hazard },
];

const avg = (xs: number[]) => (xs.length < MIN_DAYS ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const sd = (xs: number[]) => {
  if (xs.length < MIN_DAYS) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const unwrap = (m: number, pivot: number) => (m - pivot > 720 ? m - 1440 : pivot - m > 720 ? m + 1440 : m);

/** Uth 2004: VO₂max ≈ 15.3 × max HR / resting HR. */
export const vo2Estimate = (maxHr: number | null, rhr: number | null) => (maxHr && rhr ? (15.3 * maxHr) / rhr : null);

/** Each pillar's value over the window ending on `day` (`span` days). */
export function pillarValues(days: Day[], day: string, span: number, maxHr: number | null): Partial<Record<PillarKey, number>> {
  const w = days.filter((d) => d.day > addDays(day, -span) && d.day <= day);
  const nights = w.flatMap((d) => (d.night ? [d.night] : []));
  const out: Partial<Record<PillarKey, number>> = {};
  const put = (k: PillarKey, v: number | null) => {
    if (v !== null) out[k] = v;
  };
  put("sleep", avg(nights.map((n) => n.sleepMin / 60)));
  const bed = sd(nights.map((n) => unwrap(localMinutes(new Date(n.start)), 0)));
  const wake = sd(nights.map((n) => unwrap(localMinutes(new Date(n.end)), 420)));
  put("regularity", bed !== null && wake !== null ? (bed + wake) / 2 : null);
  // Weekly totals scale to the days the band could see a workout: not a day it was off, nor one of Edge's
  // alone (it detects none; from 21-oct-2026 they took strength and zones to 0, «1,3 años perdidos»).
  const seen = w.filter((d) => d.tracked).length;
  if (seen >= MIN_DAYS) {
    const perWeek = (f: (d: Day) => number) => (w.reduce((a, d) => a + f(d), 0) / seen) * 7;
    put("z13", perWeek((d) => d.z13Min) / 60);
    put("z45", perWeek((d) => d.z45Min) / 60);
    if (span >= 14) put("strength", perWeek((d) => d.strengthMin) / 60);
  }
  put("steps", avg(w.flatMap((d) => (d.steps === null ? [] : [d.steps]))));
  const rhr = avg(w.flatMap((d) => (d.rhr === null ? [] : [d.rhr])));
  put("rhr", rhr);
  put("vo2", vo2Estimate(maxHr, rhr));
  return out;
}

export interface Contribution {
  key: PillarKey;
  value: number;
  years: number;
}
export interface Healthspan {
  /** Biological minus calendar age: −3.8 is «3.8 años más joven». */
  delta: number;
  contributions: Contribution[];
}

export function healthspan(values: Partial<Record<PillarKey, number>>, age: number | null): Healthspan | null {
  const cs: Contribution[] = [];
  for (const p of PILLARS) {
    const v = values[p.key];
    if (v === undefined) continue;
    const ref = p.key === "vo2" ? (age === null ? null : referenceVo2(age)) : p.reference;
    if (ref === null) continue;
    cs.push({ key: p.key, value: v, years: Math.log(p.hazard(v) / p.hazard(ref)) * YEARS_PER_LN_HAZARD });
  }
  if (cs.length < MIN_INPUTS) return null;
  const sum = cs.reduce((a, c) => a + c.years, 0) * OVERLAP;
  const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, sum));
  // Each row carries its share of the discounted, capped total, so the rows add up to the headline.
  const scale = sum === 0 ? 0 : delta / (sum / OVERLAP);
  return { delta, contributions: cs.map((c) => ({ ...c, years: c.years * scale })) };
}

/** The delta every week for 26 weeks: what the pace line and the 6-month marks read. */
export function weeklyDeltas(days: Day[], day: string, age: number | null, maxHr: number | null): { day: string; delta: number | null }[] {
  return Array.from({ length: 26 }, (_, i) => {
    const end = addDays(day, -7 * (25 - i));
    return { day: end, delta: healthspan(pillarValues(days, end, WINDOW, maxHr), age)?.delta ?? null };
  });
}

/**
 * Pace of Aging: biological years per calendar year, from the slope of the
 * delta over at least 60 days. 1.0 ages with the calendar; WHOOP shows −1…3.
 */
export function paceOfAging(deltas: { day: string; delta: number | null }[]): number | null {
  const pts = deltas.flatMap((d, i) => (d.delta === null ? [] : [[i * 7, d.delta] as const]));
  if (pts.length < 3 || pts.at(-1)![0] - pts[0]![0] < 60) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return Math.max(-1, Math.min(3, 1 + (sxy / sxx) * 365));
}
