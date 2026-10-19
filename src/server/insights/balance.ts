import type { Candidate } from "./candidates";
import type { Day } from "./days";
import type { Finding } from "./findings";
import { OUTCOME_KEYS, outcomeOf, type OutcomeKey } from "./outcomes";
import { mean } from "./stats";

/**
 * The day's score: what he did that does him good or harm, each with its
 * points, added up (Javier, 18-oct-2026: «más X puntos si hago esto, menos
 * X puntos tal, y ver todo el rato el balance»). Only what the engine trusts
 * (good or bad), and only when that day says it happened. Things overlap, so
 * the sum is a guide, not an exact forecast. Pure.
 */
export interface Score {
  key: string;
  title: string;
  /** In the outcome's units, signed as measured: −4 lpm is good for the pulse. */
  points: number;
  good: boolean;
}

export interface DayBalance {
  day: string;
  total: number;
  /** What it did that counts. */
  items: Score[];
  /** What the outcome actually was; null until it is measured. */
  actual: number | null;
}

export interface Balance {
  /** Oldest first, the last one is the latest day. */
  days: DayBalance[];
  /** His usual value, to read the actual against. */
  usual: number | null;
}

/** How many days back the strip of totals goes. */
export const BALANCE_DAYS = 7;

export function balances(days: Day[], counted: { c: Candidate; f: Finding }[]): Record<OutcomeKey, Balance> {
  // Nights with a sleep recorded: a day the band missed has nothing to score.
  const recent = days.filter((d) => d.bed !== null).slice(-BALANCE_DAYS);
  return Object.fromEntries(
    OUTCOME_KEYS.map((o) => {
      const mine = counted.filter((x) => x.f.outcome === o);
      const values = days.flatMap((d) => {
        const v = outcomeOf[o](d);
        return v === null ? [] : [v];
      });
      const score = ({ f }: { f: Finding }): Score => ({ key: f.key, title: f.title, points: f.points, good: f.good });
      return [
        o,
        {
          usual: values.length ? mean(values) : null,
          days: recent.map((d) => {
            const items = mine.filter((x) => x.c.side(d) === true).map(score);
            return {
              day: d.day,
              total: items.reduce((s, x) => s + x.points, 0),
              items,
              actual: outcomeOf[o](d),
            };
          }),
        },
      ];
    }),
  ) as Record<OutcomeKey, Balance>;
}
