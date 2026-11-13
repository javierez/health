/**
 * The strap's minute by minute, as Edge posts it (Apple-Health-shaped `metric`
 * rows: `heart_rate` with `{ date, Min, Avg, Max }`, `hypnogram` with
 * `{ date, end, stage }`). WHOOP's API never gave either, so these screens
 * fill in from the first night Edge sends them.
 */
export interface HrPoint {
  t: number;
  bpm: number;
}
export type Stage = "awake" | "light" | "deep" | "rem";
export interface Segment {
  start: number;
  end: number;
  stage: Stage;
}

/** `2026-10-20 08:00:00 +0200` → epoch ms. */
export function stampMs(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s.replace(/^(\S+) (\S+) ([+-]\d{2})(\d{2})$/, "$1T$2$3:$4"));
  return Number.isNaN(t) ? null : t;
}

export function hrPoints(data: unknown[]): HrPoint[] {
  return data
    .flatMap((p) => {
      const o = p as { date?: unknown; Avg?: unknown; qty?: unknown };
      const t = stampMs(o.date);
      const bpm = typeof o.Avg === "number" ? o.Avg : typeof o.qty === "number" ? o.qty : null;
      return t === null || bpm === null ? [] : [{ t, bpm }];
    })
    .sort((a, b) => a.t - b.t);
}

const STAGES = new Set<Stage>(["awake", "light", "deep", "rem"]);
export function segments(data: unknown[]): Segment[] {
  return data
    .flatMap((p) => {
      const o = p as { date?: unknown; end?: unknown; stage?: unknown };
      const start = stampMs(o.date);
      const end = stampMs(o.end);
      return start === null || end === null || !STAGES.has(o.stage as Stage) ? [] : [{ start, end, stage: o.stage as Stage }];
    })
    .sort((a, b) => a.start - b.start);
}

export type Level = "low" | "mid" | "high";
export const level = (s: number): Level => (s >= 2 ? "high" : s >= 1 ? "mid" : "low");
export const LEVEL_LABEL: Record<Level, string> = { low: "Bajo", mid: "Medio", high: "Alto" };

export interface StressPoint {
  t: number;
  /** 0–3, WHOOP's scale. */
  value: number;
}

/**
 * Stress across the day, 0–3. WHOOP reads it from heart rate and HRV against
 * a 14-day baseline with movement taken out; the strap's minutes carry heart
 * rate only, so this is pulse above resting as a share of the way to a hard
 * effort (45 % of the reserve reads 3), with workouts and sleep left out and
 * a 15-minute median so one stair does not read as a fright.
 */
export function stressSeries(hr: HrPoint[], rhr: number, maxHr: number, skip: { start: number; end: number }[]): StressPoint[] {
  const span = Math.max(10, 0.45 * (maxHr - rhr));
  const awake = hr.filter((p) => !skip.some((s) => p.t >= s.start && p.t <= s.end));
  const out: StressPoint[] = [];
  for (let i = 0; i < awake.length; i += 5) {
    const t = awake[i]!.t;
    const win = awake.filter((p) => Math.abs(p.t - t) <= 7.5 * 60_000).map((p) => p.bpm).sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)]!;
    out.push({ t, value: Math.max(0, Math.min(3, (3 * (med - rhr)) / span)) });
  }
  return out;
}

/** Minutes at each level, as shares of the day measured. */
export function levelShares(points: StressPoint[]): Record<Level, number> {
  const n = points.length || 1;
  const c = { low: 0, mid: 0, high: 0 };
  for (const p of points) c[level(p.value)] += 1;
  return { low: c.low / n, mid: c.mid / n, high: c.high / n };
}
