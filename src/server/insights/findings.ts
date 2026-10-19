import type { Source } from "~/server/assistant/evidence";

import { balances, type Balance } from "./balance";
import { candidates, type Candidate, type Todo } from "./candidates";
import type { Day } from "./days";
import { OUTCOME_KEYS, OUTCOMES, outcomeOf, points, roundGap, type OutcomeKey } from "./outcomes";
import { compare, inflation, lag1, mean, qValues, quantile, type Point } from "./stats";

/**
 * What does him good and what does him harm, for each outcome (recovery
 * first): every candidate split of his days, compared the morning after.
 * Pure and free. Javier, 17 and 18-oct-2026: «siempre quiero
 * recomendaciones… qué nos ayuda más a la recuperación, al sueño, a X».
 *
 * A finding is good or bad only when the gap is big enough to matter (the
 * outcome's own threshold) AND unlikely to be chance once ~200 comparisons
 * are counted (q under 0.2; under 0.05 it is «seguro»). Big but noisy is
 * «por aclarar»: what a two-week experiment is for. Small is «no te afecta».
 * Except for bed and sleep themselves, days are compared at the same
 * bedtime: a Friday only against a Tuesday he went to bed as late.
 */
export type Tier = "good" | "bad" | "unclear" | "none";

export interface Group {
  label: string;
  values: number[];
  mean: number;
}

export interface Finding {
  key: string;
  outcome: OutcomeKey;
  tier: Tier;
  /** The direction is good for him (less resting pulse, more of the rest). */
  good: boolean;
  /** Under 5 % false alarms; otherwise «probable». */
  sure: boolean;
  title: string;
  /** The gap at the same bedtime, signed: "+16", "−8". */
  big: string;
  /** The same gap as a number, in the outcome's units: what doing it adds or takes. */
  points: number;
  nights: number;
  /** The gap over the outcome's threshold, positive when good: ranks across outcomes. */
  weight: number;
  /** What to do; null when it makes no difference. */
  todo: Todo | null;
  /** Both sides, and the gap at the same bedtime when it differs. */
  detail: string;
  /** The nights with it, then without: what the chart draws. */
  groups: [Group, Group];
  source?: Source;
  controllable: boolean;
  /** Why the AI proposed it, when it did. */
  why?: string;
}

export interface Ranked {
  good: Finding[];
  bad: Finding[];
  unclear: Finding[];
  neutral: Finding[];
}

export interface Findings {
  by: Record<OutcomeKey, Ranked>;
  /** Not enough nights on either side for any outcome yet. */
  waiting: string[];
  /** Days with a morning measured. */
  nights: number;
  /** Comparisons made: what the chance correction counted. */
  tests: number;
  /** The last days scored with what the engine trusts. */
  balance: Record<OutcomeKey, Balance>;
}

/** Under this on either side, one quiet week passes for an effect («Días que hablas de tu pareja», 11 nights: −6). */
const MIN_NIGHTS = 15;
const SURE = 0.05;
const PROBABLE = 0.2;


export function findings(days: Day[], extra: Candidate[] = []): Findings {
  const beds = days.flatMap((d) => (d.bed === null ? [] : [d.bed]));
  const cut = beds.length >= 30 ? [quantile(beds, 1 / 3), quantile(beds, 2 / 3)] : null;
  // Too few bedtimes to cut in thirds: one stratum, nothing adjusted. An unknown bedtime is a stratum of its own.
  const stratum = (d: Day) => (cut === null ? 0 : d.bed === null ? 3 : d.bed <= cut[0]! ? 0 : d.bed <= cut[1]! ? 1 : 2);

  const tests: { c: Candidate; o: OutcomeKey; a: Point[]; b: Point[]; gap: number; p: number }[] = [];
  const all = [...candidates(days), ...extra];
  const repeats = Object.fromEntries(OUTCOME_KEYS.map((o) => [o, lag1(days.map(outcomeOf[o]))])) as Record<OutcomeKey, number>;
  for (const c of all) {
    const sides = days.map((d) => c.side(d));
    const repeat = lag1(sides.map((x) => (x === null ? null : x ? 1 : 0)));
    for (const o of OUTCOME_KEYS) {
      if (c.skip?.includes(o)) continue;
      const a: Point[] = [];
      const b: Point[] = [];
      days.forEach((d, i) => {
        const v = outcomeOf[o](d);
        const side = sides[i] ?? null;
        const s = c.adjust ? stratum(d) : 0;
        if (v === null || side === null) return;
        (side ? a : b).push({ v, s });
      });
      if (a.length < MIN_NIGHTS || b.length < MIN_NIGHTS) continue;
      const cmp = compare(a, b, inflation(repeat, repeats[o]));
      if (cmp) tests.push({ c, o, a, b, gap: cmp.gap, p: cmp.p });
    }
  }

  const q = qValues(tests.map((t) => t.p));
  const by = Object.fromEntries(OUTCOME_KEYS.map((o) => [o, { good: [], bad: [], unclear: [], neutral: [] }])) as unknown as Record<
    OutcomeKey,
    Ranked
  >;
  const counted: { c: Candidate; f: Finding }[] = [];
  tests.forEach((t, i) => {
    const meta = OUTCOMES[t.o];
    const va = t.a.map((x) => x.v);
    const vb = t.b.map((x) => x.v);
    const good = (meta.better === "up" ? 1 : -1) * t.gap > 0;
    const clear = Math.abs(t.gap) >= meta.gap;
    const tier: Tier = clear && q[i]! < PROBABLE ? (good ? "good" : "bad") : clear ? "unclear" : "none";
    const raw = mean(va) - mean(vb);
    const sameBed = t.c.adjust && Math.abs(raw - t.gap) >= meta.gap / 2;
    const f: Finding = {
      key: t.c.key,
      outcome: t.o,
      tier,
      good,
      sure: q[i]! < SURE,
      title: t.c.title,
      big: points(t.o, t.gap, false).replace(/^(?=\d)/, "+"),
      points: roundGap(t.o, t.gap),
      nights: va.length,
      weight: ((good ? 1 : -1) * Math.abs(t.gap)) / meta.gap,
      // What happens to him has nothing to do about it.
      todo: tier === "none" || !t.c.controllable ? null : good ? t.c.good : t.c.bad,
      detail:
        `${t.c.labels[0]}: ${meta.fmt(mean(va))} (${va.length} noches). ${t.c.labels[1]}: ${meta.fmt(mean(vb))} (${vb.length}).` +
        (sameBed ? ` A la misma hora de acostarte, la diferencia es ${points(t.o, t.gap, false).replace(/^(?=\d)/, "+")}.` : ""),
      groups: [
        { label: t.c.labels[0], values: va, mean: mean(va) },
        { label: t.c.labels[1], values: vb, mean: mean(vb) },
      ],
      source: t.c.source,
      controllable: t.c.controllable ?? false,
      why: t.c.why,
    };
    const ranked = by[t.o];
    // Only what he does adds up in the balance: a Sunday is not a point.
    if ((tier === "good" || tier === "bad") && t.c.controllable) counted.push({ c: t.c, f });
    (tier === "good" ? ranked.good : tier === "bad" ? ranked.bad : tier === "unclear" ? ranked.unclear : ranked.neutral).push(f);
  });
  for (const r of Object.values(by)) {
    for (const list of [r.good, r.bad, r.unclear, r.neutral]) list.sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight));
  }

  const tested = new Set(tests.map((t) => t.c.key));
  return {
    by,
    waiting: all.filter((c) => c.controllable && !tested.has(c.key)).map((c) => c.title),
    nights: days.filter((d) => d.recovery !== null).length,
    tests: tests.length,
    balance: balances(days, counted),
  };
}
