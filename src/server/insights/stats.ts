/**
 * The arithmetic behind «qué te hace bien y mal», pure and free.
 *
 * - `compare`: the gap between two sets of mornings, taken inside each
 *   stratum (his bedtime third) and averaged, so a Friday is only compared
 *   with a Tuesday he went to bed at the same hour. Without strata it is the
 *   plain gap. With it, a z-test says how likely the gap is to be noise.
 * - `qValues`: with ~150 comparisons, ~7 look real by chance at p < 0.05.
 *   Benjamini-Hochberg turns each p into the share of false alarms one would
 *   accept by believing it and everything stronger.
 *
 * - `inflation`: days follow each other. A supplement taken every day since
 *   July and a recovery that drifts week to week look like twice the
 *   evidence they are. The gap's error is widened by how much both series
 *   repeat themselves from one day to the next (Bretherton et al., J Climate
 *   1999: effective sample size of two autocorrelated series).
 */
export interface Point {
  v: number;
  /** The stratum: 0 when nothing is adjusted for. */
  s: number;
}

export interface Comparison {
  /** Mean of `a` minus mean of `b`, inside each stratum, weighted. */
  gap: number;
  /** The same, without strata: what the chart shows. */
  raw: number;
  se: number;
  p: number;
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function variance(xs: number[]) {
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Below three a side, a stratum says nothing and is left out. */
const MIN_PER_STRATUM = 3;

/** `inflate` widens the error for days that follow each other (`inflation`). */
export function compare(a: Point[], b: Point[], inflate = 1): Comparison | null {
  const strata = [...new Set([...a, ...b].map((p) => p.s))];
  let sw = 0;
  let sg = 0;
  let sv = 0;
  for (const s of strata) {
    const xa = a.filter((p) => p.s === s).map((p) => p.v);
    const xb = b.filter((p) => p.s === s).map((p) => p.v);
    if (xa.length < MIN_PER_STRATUM || xb.length < MIN_PER_STRATUM) continue;
    // The harmonic weight: a stratum counts as much as its smaller side lets it.
    const w = (xa.length * xb.length) / (xa.length + xb.length);
    sw += w;
    sg += w * (mean(xa) - mean(xb));
    sv += w * w * (variance(xa) / xa.length + variance(xb) / xb.length);
  }
  if (sw === 0) return null;
  const gap = sg / sw;
  const se = (Math.sqrt(sv) / sw) * inflate;
  const p = se === 0 ? (gap === 0 ? 1 : 0) : 2 * (1 - phi(Math.abs(gap) / se));
  return { gap, raw: mean(a.map((x) => x.v)) - mean(b.map((x) => x.v)), se, p };
}

/** How much a day's value repeats the day before's: lag-1 correlation over consecutive days both known. Under 10 pairs, 0. */
export function lag1(xs: (number | null)[]): number {
  const pairs: [number, number][] = [];
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i - 1];
    const y = xs[i];
    if (x !== null && x !== undefined && y !== null && y !== undefined) pairs.push([x, y]);
  }
  if (pairs.length < 10) return 0;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** The error's widening for two series with these lag-1 correlations: never narrower, at most ×4,4. */
export function inflation(rSide: number, rOutcome: number): number {
  const r = Math.min(Math.max(rSide * rOutcome, 0), 0.9);
  return Math.sqrt((1 + r) / (1 - r));
}

/** The standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
export function phi(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Benjamini-Hochberg: each p's false-discovery rate, in the same order. */
export function qValues(ps: number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const q = new Array<number>(ps.length);
  let min = 1;
  for (let k = order.length - 1; k >= 0; k--) {
    min = Math.min(min, (order[k]!.p * ps.length) / (k + 1));
    q[order[k]!.i] = min;
  }
  return q;
}

/** The value at quantile `q` of `xs` (lower), for his own thirds. */
export const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)]!;
