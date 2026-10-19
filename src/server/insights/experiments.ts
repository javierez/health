import type { Day } from "./days";
import type { Group } from "./findings";
import { OUTCOMES, outcomeOf, type OutcomeKey } from "./outcomes";
import { mean } from "./stats";

/**
 * Two weeks to settle what his data alone cannot: on alternate days he does
 * (or avoids) one thing, ticks it in «Hoy», and the mornings after are
 * compared with the other days of the same fortnight. Same weeks, same life,
 * only that changes: stronger than a year of looking back. Pure.
 */
export interface ExperimentPlan {
  startDay: string;
  days: number;
  outcome: string;
}

/** Below this many days a side, it says «aún pronto». */
export const MIN_SIDE = 5;

const offset = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** True on its days (the first, the third…), false on the others, null outside the fortnight. */
export function isOn(plan: ExperimentPlan, day: string): boolean | null {
  const n = offset(plan.startDay, day);
  return n < 0 || n >= plan.days ? null : n % 2 === 0;
}

/** Day N of 14, from 1; past the end, the end. */
export const dayOf = (plan: ExperimentPlan, day: string) => Math.min(plan.days, offset(plan.startDay, day) + 1);

export interface ExperimentResult {
  groups: [Group, Group];
  /** Its days he ticked, of those gone by. */
  done: number;
  due: number;
  /** «Te sienta bien», «Te sienta mal», «No cambia nada»; null until both sides have five mornings. */
  verdict: string | null;
  gap: number | null;
}

/** Its days he ticked against the other days, on the morning (or night) after each. */
export function experimentResult(plan: ExperimentPlan, days: Day[], ticked: Set<string>, labels: [string, string]): ExperimentResult {
  const key = plan.outcome as OutcomeKey;
  const meta = OUTCOMES[key];
  const on: number[] = [];
  const off: number[] = [];
  let due = 0;
  for (const d of days) {
    const side = isOn(plan, d.day);
    if (side === null) continue;
    if (side) due++;
    const v = outcomeOf[key](d);
    if (v === null) continue;
    if (side && ticked.has(d.day)) on.push(v);
    else if (!side) off.push(v);
  }
  const ready = on.length >= MIN_SIDE && off.length >= MIN_SIDE;
  const gap = ready ? mean(on) - mean(off) : null;
  const good = gap !== null && (meta.better === "up" ? gap > 0 : gap < 0);
  return {
    groups: [
      { label: labels[0], values: on, mean: on.length ? mean(on) : 0 },
      { label: labels[1], values: off, mean: off.length ? mean(off) : 0 },
    ],
    done: [...ticked].filter((t) => isOn(plan, t)).length,
    due,
    verdict: gap === null ? null : Math.abs(gap) < meta.gap ? "No cambia nada" : good ? "Te sienta bien" : "Te sienta mal",
    gap,
  };
}
