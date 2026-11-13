import { TIME_ZONE } from "~/lib/day";
import type { AppleHealthPush } from "./apple-health";
import { edgePushSchema, type EdgePush } from "./ingest";

/**
 * The band by hand, for nothing: Edge's own database (Profile → Settings →
 * Export, backup, import → Database), AirDropped to the Mac and loaded by
 * `scripts/import-edge-db.ts`.
 *
 * Its rows become the two bodies `/api/webhooks/edge` already takes: the push
 * Edge itself would send (nights, recovery inputs, strain, workouts), and, per
 * day, the minute-by-minute heart rate plus Edge's whole daily row as `metric`
 * rows, so what the file holds is not narrowed to what WHOOP's shape has room for.
 */
export interface EdgeDbRows {
  /** `v_daily`: one row per day, already named the way the push names them. */
  daily: Record<string, unknown>[];
  /** `day_result`: the sleep window, `{ onset_ms, offset_ms }`. Last computed wins. */
  windows: { day_id: unknown; window_json: unknown }[];
  /** `v_sessions`. */
  sessions: Record<string, unknown>[];
  /** `decoded_onehz` folded to minutes: epoch seconds of the minute and its beats. */
  minutes: { t: number; min: number; avg: number; max: number }[];
}

function window(json: unknown): { onset?: number; offset?: number } {
  try {
    const w = JSON.parse(String(json)) as { onset_ms?: unknown; offset_ms?: unknown };
    const sec = (ms: unknown) => (typeof ms === "number" && ms > 0 ? Math.round(ms / 1000) : undefined);
    return { onset: sec(w.onset_ms), offset: sec(w.offset_ms) };
  } catch {
    return {};
  }
}

export function edgeDbPush(rows: EdgeDbRows): EdgePush {
  const windows = new Map(rows.windows.map((w) => [String(w.day_id), window(w.window_json)]));
  return edgePushSchema.parse({
    days: rows.daily.map((d) => {
      const w = windows.get(String(d.date));
      return { ...d, sleep_start: w?.onset, sleep_end: w?.offset };
    }),
    workouts: rows.sessions.filter((s) => s.status !== "live"),
  });
}

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Epoch seconds → `2026-10-20 08:00:00 +0200`, Madrid, the way Health Auto Export dates a point. */
export function stamp(sec: number): string {
  const at = new Date(sec * 1000);
  const p = Object.fromEntries(partsFmt.formatToParts(at).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const off = Math.round((wall - at.getTime()) / 60_000);
  const abs = Math.abs(off);
  const zone = `${off < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${zone}`;
}

/** One body per day, so a week of minutes never nears Vercel's 4.5 MB. */
export function edgeDbExtras(rows: EdgeDbRows): AppleHealthPush[] {
  const days = new Map<string, AppleHealthPush["data"]["metrics"]>();
  const at = (d: string) => days.get(d) ?? days.set(d, []).get(d)!;
  for (const m of rows.minutes) {
    const date = stamp(m.t);
    const metrics = at(date.slice(0, 10));
    const hr = metrics.find((x) => x.name === "heart_rate") ?? metrics[metrics.push({ name: "heart_rate", units: "bpm", data: [] }) - 1]!;
    hr.data.push({ date, Min: m.min, Avg: m.avg, Max: m.max });
  }
  for (const d of rows.daily) {
    if (typeof d.date === "string") at(d.date).push({ name: "edge_daily", units: null, data: [d] });
  }
  return [...days.values()].map((metrics) => ({ data: { metrics, workouts: [] } }));
}
