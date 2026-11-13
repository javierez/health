import { BASELINE_NEED, MIN_BASELINE, median, recoveryEstimate, sleepDebt, sleepPerformance } from "~/lib/whoop/estimate";
import type { Row } from "~/server/whoop/sync";

/**
 * Edge's rows made whole before they are stored: the sleep need, the sleep
 * performance and the recovery WHOOP used to score, worked out from his own
 * history (`~/lib/whoop/estimate`). Here and only here, so the chat, the board,
 * the weeks and the WHOOP screens all read one number. Pure: `ingest.ts`
 * hands in the stored nights and mornings.
 */
export type Past = Pick<Row, "kind" | "externalId" | "startAt" | "raw">;

type Raw = { nap?: boolean; score?: Record<string, unknown> | null } & Record<string, unknown>;
const scoreOf = (raw: unknown): Record<string, unknown> => (raw as Raw | null)?.score ?? {};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const milli = (minutes: number) => minutes * 60_000;

/** The 30 mornings before are his usual. */
const BASE_MORNINGS = 30;
/** Once 14 of them are Edge's, its HRV is held only against its own: WHOOP computed it its way. */
const EDGE_ONLY = 14;

/** In bed minus awake, the way every reader counts it. */
export function asleepOf(raw: unknown): number | null {
  const st = scoreOf(raw).stage_summary as { total_in_bed_time_milli?: number; total_awake_time_milli?: number } | undefined;
  return st?.total_in_bed_time_milli ? Math.round((st.total_in_bed_time_milli - (st.total_awake_time_milli ?? 0)) / 60_000) : null;
}

export function fillIn(rows: Row[], past: Past[]): Row[] {
  // What this push says wins over what is stored: Edge resends the last days, longer each time.
  const sent = new Set(rows.map((r) => r.id));
  const all = [...past.filter((p) => !sent.has(`${p.kind}:${p.externalId}`)), ...rows].filter((r) => r.startAt);
  const latestFirst = (kind: string) => all.filter((r) => r.kind === kind).sort((a, b) => b.startAt!.getTime() - a.startAt!.getTime());
  const nights = latestFirst("sleep").filter((n) => !(n.raw as Raw).nap);
  const mornings = latestFirst("recovery");

  return rows.map((r) => {
    if (!r.externalId.startsWith("edge-") || !r.startAt) return r;
    const s = scoreOf(r.raw);

    if (r.kind === "sleep" && !s.sleep_needed) {
      const asleep = asleepOf(r.raw);
      if (asleep === null) return r;
      const before = nights.filter((n) => n.startAt! < r.startAt!).flatMap((n) => asleepOf(n.raw) ?? []);
      const debt = sleepDebt(before);
      const performance = sleepPerformance(asleep, BASELINE_NEED + debt);
      const needed = { baseline_milli: milli(BASELINE_NEED), need_from_sleep_debt_milli: milli(debt), need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 };
      return { ...r, score: performance, raw: { ...(r.raw as Raw), score: { ...s, sleep_needed: needed, sleep_performance_percentage: performance }, estimated: true } };
    }

    if (r.kind === "recovery" && num(s.recovery_score) === null) {
      const hrv = num(s.hrv_rmssd_milli);
      const rhr = num(s.resting_heart_rate);
      if (hrv === null || rhr === null) return r;
      const window = mornings.filter((m) => m.startAt! < r.startAt!).slice(0, BASE_MORNINGS);
      const edge = window.filter((m) => m.externalId.startsWith("edge-"));
      const usual = (edge.length >= EDGE_ONLY ? edge : window).flatMap((m) => {
        const ms = scoreOf(m.raw);
        const h = num(ms.hrv_rmssd_milli);
        const p = num(ms.resting_heart_rate);
        return h === null || p === null ? [] : [{ h, p }];
      });
      if (usual.length < MIN_BASELINE) return r;
      // Its night carries the same id: `edge-<the morning>`.
      const night = nights.find((n) => n.externalId === r.externalId);
      const base = { hrv: median(usual.map((u) => u.h))!, rhr: median(usual.map((u) => u.p))! };
      const recovery = recoveryEstimate({ hrv, rhr, asleepMin: night ? asleepOf(night.raw) : null }, base);
      // What it was held against goes with it, so «44 %» can be explained: his HRV against his usual.
      const usualOf = { hrv: Math.round(base.hrv), rhr: Math.round(base.rhr) };
      return { ...r, score: recovery, raw: { ...(r.raw as Raw), score: { ...s, recovery_score: recovery }, estimated: true, usual: usualOf } };
    }
    return r;
  });
}
