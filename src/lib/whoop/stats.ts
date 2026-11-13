import { addDays } from "~/lib/day";
import type { Day } from "./days";

/**
 * Every number WHOOP shows, by key, and the comparisons it draws around it:
 * today against the prior 30 days, a personal range, and a trend at W / M / 6M.
 */
export const METRICS = {
  recovery: { label: "Recuperación", unit: "%", up: true, get: (d: Day) => d.recovery },
  hrv: { label: "Variabilidad cardiaca", unit: "ms", up: true, get: (d: Day) => d.hrv },
  rhr: { label: "Pulso en reposo", unit: "lpm", up: false, get: (d: Day) => d.rhr },
  resp: { label: "Frecuencia respiratoria", unit: "rpm", up: null, get: (d: Day) => d.night?.resp ?? null },
  spo2: { label: "Oxígeno en sangre", unit: "%", up: true, get: (d: Day) => d.spo2 },
  skinTemp: { label: "Temperatura de la piel", unit: "°C", up: null, get: (d: Day) => d.skinTemp },
  sleepPerf: { label: "Rendimiento del sueño", unit: "%", up: true, get: (d: Day) => d.night?.performance ?? null },
  sleepHours: { label: "Horas de sueño", unit: "h", up: true, get: (d: Day) => (d.night ? d.night.sleepMin / 60 : null) },
  hoursVsNeed: { label: "Horas frente a lo necesario", unit: "%", up: true, get: (d: Day) => (d.night?.neededMin ? Math.min(100, (d.night.sleepMin / d.night.neededMin) * 100) : null) },
  inBed: { label: "Tiempo en cama", unit: "h", up: null, get: (d: Day) => (d.night ? d.night.inBedMin / 60 : null) },
  consistency: { label: "Regularidad del sueño", unit: "%", up: true, get: (d: Day) => d.night?.consistency ?? null },
  efficiency: { label: "Eficiencia del sueño", unit: "%", up: true, get: (d: Day) => d.night?.efficiency ?? null },
  // Edge stages a night its own way: deep 6–20 % of it (21–25 oct 2026) against WHOOP's 29 %. Its nights are
  // left out, or the month would read as a fall in deep sleep that never happened.
  restorative: { label: "Sueño reparador", unit: "%", up: true, get: (d: Day) => (d.night?.sleepMin && !d.night.edge ? ((d.night.deepMin + d.night.remMin) / d.night.sleepMin) * 100 : null) },
  restorativeHours: { label: "Horas de sueño reparador", unit: "h", up: true, get: (d: Day) => (d.night && !d.night.edge ? (d.night.deepMin + d.night.remMin) / 60 : null) },
  debt: { label: "Deuda de sueño", unit: "h", up: false, get: (d: Day) => (d.night?.debtMin != null ? d.night.debtMin / 60 : null) },
  strain: { label: "Esfuerzo", unit: "", up: null, get: (d: Day) => d.strain },
  kcal: { label: "Calorías", unit: "kcal", up: null, get: (d: Day) => d.kcal },
  avgHr: { label: "Pulso medio", unit: "lpm", up: null, get: (d: Day) => d.avgHr },
  steps: { label: "Pasos", unit: "", up: true, get: (d: Day) => d.steps },
  z13: { label: "Zonas 1-3", unit: "h", up: true, get: (d: Day) => d.z13Min / 60 },
  z45: { label: "Zonas 4-5", unit: "h", up: true, get: (d: Day) => d.z45Min / 60 },
  strength: { label: "Tiempo de fuerza", unit: "h", up: true, get: (d: Day) => d.strengthMin / 60 },
  stress: { label: "Estrés del día", unit: "", up: false, get: (d: Day) => d.stress },
} satisfies Record<string, { label: string; unit: string; up: boolean | null; get: (d: Day) => number | null }>;
export type MetricKey = keyof typeof METRICS;

/** Summed over a week in WHOOP (zone and strength time); the rest are averages. */
export const WEEKLY_TOTAL = new Set<MetricKey>(["z13", "z45", "strength"]);

export const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const sd = (xs: number[], m: number) => Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));

/** Values of a metric on the days from `from` to `to`, both included. */
export function values(days: Day[], key: MetricKey, from: string, to: string): number[] {
  return days.filter((d) => d.day >= from && d.day <= to).flatMap((d) => {
    const v = METRICS[key].get(d);
    return v === null ? [] : [v];
  });
}

export interface Compare {
  value: number | null;
  /** Average of the 30 days before. */
  avg: number | null;
  /** True when today is better than the 30 days, false when worse, null when level or neutral. */
  better: boolean | null;
}

/** Today vs prior 30 days: the arrow on every WHOOP row. Within 3 % of the average is level. */
export function compare(days: Day[], key: MetricKey, day: string): Compare {
  const today = days.find((d) => d.day === day);
  const value = today ? METRICS[key].get(today) : null;
  const avg = mean(values(days, key, addDays(day, -30), addDays(day, -1)));
  const up = METRICS[key].up;
  if (value === null || avg === null || up === null || Math.abs(value - avg) <= Math.abs(avg) * 0.03) return { value, avg, better: null };
  return { value, avg, better: value > avg === up };
}

export interface Range {
  low: number;
  high: number;
  value: number | null;
  within: boolean | null;
}

/** Health Monitor's personal range: the 30 days before, ± one standard deviation. */
export function personalRange(days: Day[], key: MetricKey, day: string): Range | null {
  const xs = values(days, key, addDays(day, -30), addDays(day, -1));
  const m = mean(xs);
  if (m === null || xs.length < 7) return null;
  const s = Math.max(sd(xs, m), Math.abs(m) * 0.02);
  const today = days.find((d) => d.day === day);
  const value = today ? METRICS[key].get(today) : null;
  return { low: m - s, high: m + s, value, within: value === null ? null : value >= m - s && value <= m + s };
}

export type Span = "W" | "M" | "6M";
export interface TrendPoint {
  label: string;
  from: string;
  value: number | null;
}
export interface Trend {
  points: TrendPoint[];
  /** The period's headline: weekly total or average. */
  value: number | null;
  /** Against the period before, in % (null when either side is empty). */
  change: number | null;
}

const short = new Intl.DateTimeFormat("es-ES", { day: "numeric", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" });
const noon = (d: string) => new Date(`${d}T12:00:00Z`);

/** W: the 7 days. M: the 30 days. 6M: 26 weeks, a point per week. Ends on `day`. */
export function trend(days: Day[], key: MetricKey, span: Span, day: string): Trend {
  const total = WEEKLY_TOTAL.has(key);
  const sum = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0));
  if (span === "6M") {
    const points = Array.from({ length: 26 }, (_, i) => {
      const to = addDays(day, -7 * (25 - i));
      const from = addDays(to, -6);
      const xs = values(days, key, from, to);
      return { label: i % 4 === 0 ? month.format(noon(from)) : "", from, value: total ? sum(xs) : mean(xs) };
    });
    const now = mean(points.slice(-13).flatMap((p) => (p.value === null ? [] : [p.value])));
    const before = mean(points.slice(0, 13).flatMap((p) => (p.value === null ? [] : [p.value])));
    return { points, value: now, change: now !== null && before ? ((now - before) / Math.abs(before)) * 100 : null };
  }
  const n = span === "W" ? 7 : 30;
  const points = Array.from({ length: n }, (_, i) => {
    const d = addDays(day, i - n + 1);
    const v = days.find((x) => x.day === d);
    return { label: span === "W" ? `${weekday.format(noon(d))} ${short.format(noon(d))}` : i % 5 === 0 ? short.format(noon(d)) : "", from: d, value: v ? METRICS[key].get(v) : null };
  });
  const xs = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const prev = values(days, key, addDays(day, -2 * n + 1), addDays(day, -n));
  const now = total && span === "W" ? sum(xs) : mean(xs);
  const before = total && span === "W" ? sum(prev) : mean(prev);
  return { points, value: now, change: now !== null && before ? ((now - before) / Math.abs(before)) * 100 : null };
}

/** WHOOP's recovery zones. */
export const zone = (recovery: number) => (recovery >= 67 ? "high" : recovery >= 34 ? "mid" : "low");

/** The strain worth aiming for, from the morning's recovery (WHOOP's Strain Target). */
export function strainTarget(recovery: number | null): { low: number; high: number; optimal: number } | null {
  if (recovery === null) return null;
  if (recovery >= 67) return { low: 14, high: 18, optimal: 16 };
  if (recovery >= 34) return { low: 10, high: 14, optimal: 12 };
  return { low: 4, high: 10, optimal: 8 };
}

/** WHOOP's four strain bands. */
export const strainBand = (s: number) => (s >= 18 ? "Al máximo" : s >= 14 ? "Alto" : s >= 10 ? "Moderado" : "Ligero");

/** Typical share of a sleep stage: lowest and highest of the 30 nights before. */
export function typicalStage(days: Day[], day: string, stage: "awakeMin" | "lightMin" | "deepMin" | "remMin"): [number, number] | null {
  const xs = days
    .filter((d) => d.day >= addDays(day, -30) && d.day < day && d.night && d.night.inBedMin > 0)
    .map((d) => (d.night![stage] / d.night!.inBedMin) * 100)
    .sort((a, b) => a - b);
  if (xs.length < 5) return null;
  // Tenth to ninetieth percentile: one odd night does not stretch the box.
  return [xs[Math.floor(xs.length * 0.1)]!, xs[Math.ceil(xs.length * 0.9) - 1]!];
}
