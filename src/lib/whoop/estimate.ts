/**
 * What WHOOP scored and the strap alone does not: sleep need, sleep
 * performance and recovery. Fitted on his own WHOOP year (25-oct-2026: 280
 * nights, 253 mornings), so a day from Edge reads like a day from WHOOP. A
 * row that carries one of these says so (`estimated` in its raw), and the chat
 * calls it estimated: it is never passed off as WHOOP's.
 */

/** WHOOP's baseline need: 7 h 41 on every night it scored. */
export const BASELINE_NEED = 461;
/** WHOOP never put more than 2 h 08 of debt on a night. */
const MAX_DEBT = 128;
/** Fewer mornings than this before it and recovery is not estimated. */
export const MIN_BASELINE = 10;

/**
 * Debt from the seven nights before (minutes asleep, latest first): half of
 * each night's shortfall, worth 0.7 less per night back. Off WHOOP's own debt
 * by 9.5 min on average; a flat guess is off by 20.7.
 */
export function sleepDebt(before: number[]): number {
  const owed = before.slice(0, 7).reduce((sum, asleep, back) => sum + (BASELINE_NEED - asleep) * 0.7 ** back, 0);
  return Math.round(Math.max(0, Math.min(MAX_DEBT, owed * 0.5)));
}

/** WHOOP's own definition: what he slept against what he needed. */
export const sleepPerformance = (asleep: number, need: number) => Math.round(Math.min(100, (asleep / need) * 100));

/**
 * Recovery from the morning's HRV and resting pulse against his usual
 * (`base`, the median of the 30 mornings before) and the hours slept:
 * 62.8 + 55.7 × ln(HRV / usual) − 1.16 × (pulse − usual) + 7.1 × (hours − 7).
 * On the 60 latest mornings, left out of the fit, 9 points off WHOOP's.
 */
export function recoveryEstimate(m: { hrv: number; rhr: number; asleepMin: number | null }, base: { hrv: number; rhr: number }): number {
  const hours = m.asleepMin === null ? 0 : m.asleepMin / 60 - 7;
  const score = 62.8 + 55.7 * Math.log(m.hrv / base.hrv) - 1.16 * (m.rhr - base.rhr) + 7.1 * hours;
  return Math.round(Math.max(1, Math.min(99, score)));
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
