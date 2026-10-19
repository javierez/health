import { OUTCOMES, roundGap, type OutcomeKey } from "~/server/insights/outcomes";

/**
 * Points in color: gray for good, amber for harm, darker the bigger
 * (Javier, 18-oct-2026: «gris y ámbar, está perfecto»). Five steps against
 * the biggest on screen. Pulse goes the other way: −4 lpm is good.
 */
const GOOD_BG = ["bg-gray-200", "bg-gray-400", "bg-gray-500", "bg-gray-700", "bg-gray-900"];
const BAD_BG = ["bg-amber-100", "bg-amber-200", "bg-amber-400", "bg-amber-600", "bg-amber-800"];
const GOOD_TEXT = ["text-gray-700", "text-gray-900"];
const BAD_TEXT = ["text-amber-600", "text-amber-800"];

/** 0 to 4: how big against the biggest. */
export const step = (n: number, max: number) => Math.min(4, Math.max(0, Math.ceil((Math.abs(n) / Math.max(1, max)) * 5) - 1));

const good = (o: OutcomeKey, n: number) => (OUTCOMES[o].better === "up" ? n > 0 : n < 0);

/** The number's color. Only the two strongest steps: it has to read on white. */
export function ink(o: OutcomeKey, n: number, max = Math.abs(n)) {
  if (roundGap(o, n) === 0) return "text-gray-400";
  return (good(o, n) ? GOOD_TEXT : BAD_TEXT)[step(n, max) >= 4 ? 1 : 0]!;
}

/** A bar's or a day's background; `floor` keeps small ones visible. */
export function fill(o: OutcomeKey, n: number, max: number, floor = 0) {
  if (roundGap(o, n) === 0) return "bg-gray-100";
  return (good(o, n) ? GOOD_BG : BAD_BG)[Math.max(floor, step(n, max))]!;
}
