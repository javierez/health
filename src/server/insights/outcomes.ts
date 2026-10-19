import type { Day } from "./days";

/**
 * What a day can change, each one a tab of «Cómo te afecta»: recovery first,
 * the one that matters most (Javier, 18-oct-2026: «el parámetro más
 * importante es la recuperación… qué nos ayuda más al sueño, a X, a Y»).
 * His mood and his symptoms, told each night, too («estado de ánimo me
 * parece muy importante… y síntomas también», 18-oct-2026).
 * Pure and shared with the screen, which formats with it.
 */
export const OUTCOME_KEYS = ["recovery", "mood", "sleep", "hrv", "rhr", "symptoms", "nextLines"] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

export interface Outcome {
  /** The tab. */
  label: string;
  /** Under the chart: what each dot is. */
  axis: string;
  /** The smallest gap that matters to him; below it, «no te afecta» however sure. */
  gap: number;
  /** Lower resting heart rate is the good direction. */
  better: "up" | "down";
  fmt: (v: number) => string;
  /** After a signed gap: «+16», «+40 min», «−4 lpm». Recovery's are plain points. */
  unit: string;
  /** Mood is out of 10: «+0,8», not «+1». */
  decimals?: number;
}

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

export const OUTCOMES: Record<OutcomeKey, Outcome> = {
  recovery: { label: "Recuperación", axis: "recuperación a la mañana siguiente", gap: 5, better: "up", fmt: (v) => `${Math.round(v)} %`, unit: "" },
  sleep: { label: "Sueño", axis: "lo que dormiste esa noche", gap: 20, better: "up", fmt: hm, unit: " min" },
  hrv: { label: "VFC", axis: "VFC a la mañana siguiente", gap: 4, better: "up", fmt: (v) => `${Math.round(v)} ms`, unit: " ms" },
  rhr: { label: "Pulso", axis: "pulso en reposo a la mañana siguiente", gap: 2, better: "down", fmt: (v) => `${Math.round(v)} lpm`, unit: " lpm" },
  mood: {
    label: "Ánimo",
    axis: "tu ánimo al día siguiente, del 1 al 10",
    gap: 0.7,
    better: "up",
    fmt: (v) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}/10`,
    unit: "",
    decimals: 1,
  },
  // Each day is 100 (a symptom) or 0: the mean is the share of days.
  symptoms: { label: "Síntomas", axis: "días con algún síntoma al día siguiente", gap: 15, better: "down", fmt: (v) => `${Math.round(v)} % de días`, unit: " %" },
  // His median day is ~10.000 lines (most written with AI): a fifth of it is a real change.
  nextLines: {
    label: "Código",
    axis: "tus líneas de código al día siguiente",
    gap: 2_000,
    better: "up",
    fmt: (v) => `${Math.round(v).toLocaleString("es-ES")} líneas`,
    unit: " líneas",
  },
};

/** A gap rounded as its outcome reads: whole points, or tenths for mood. */
export const roundGap = (o: OutcomeKey, n: number) => {
  const k = 10 ** (OUTCOMES[o].decimals ?? 0);
  return Math.round(n * k) / k;
};

/** «+16», «−4 lpm», «+0,8», «0»: points with their sign and unit. */
export function points(o: OutcomeKey, n: number, unit = true) {
  const r = roundGap(o, n);
  const abs = Math.abs(r).toLocaleString("es-ES", { maximumFractionDigits: OUTCOMES[o].decimals ?? 0 });
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${abs}${unit ? OUTCOMES[o].unit : ""}`;
}

/** The outcome's value after a day: the next morning, that night, or the next day's code. */
export const outcomeOf: Record<OutcomeKey, (d: Day) => number | null> = {
  recovery: (d) => d.recovery,
  sleep: (d) => d.slept,
  hrv: (d) => d.hrv,
  rhr: (d) => d.rhr,
  nextLines: (d) => d.nextLines,
  mood: (d) => d.nextMood,
  symptoms: (d) => (d.nextSymptom === null ? null : d.nextSymptom ? 100 : 0),
};
