import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { whoopRecords } from "~/db/schema";
import { row, type Row } from "~/server/whoop/sync";
import { edgeRows, storeRows, type EdgePush } from "./ingest";

/**
 * The band through Apple Health. OpenStrap Edge writes the strap's nights, HRV,
 * resting HR and workouts into Apple Health, and the Health Auto Export app
 * posts Apple Health here (Automations → REST API, JSON, Export Version 2,
 * sleep aggregated).
 *
 * The nightly numbers become the push Edge itself would send, so they land as
 * the WHOOP-shaped rows the rest of the app already reads. Every metric's day
 * of points is also kept whole as a `metric` row: nothing exported is dropped.
 */
const point = z.record(z.string(), z.unknown());

export const appleHealthSchema = z.object({
  data: z.object({
    metrics: z.array(z.object({ name: z.string(), units: z.string().nullish(), data: z.array(point) })).default([]),
    workouts: z.array(point).default([]),
  }),
});
export type AppleHealthPush = z.infer<typeof appleHealthSchema>;
type Point = Record<string, unknown>;

/** `2024-02-06 14:30:00 -0800` → epoch seconds. */
export function epoch(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s.replace(/^(\S+) (\S+) ([+-]\d{2})(\d{2})$/, "$1T$2$3:$4"));
  return Number.isNaN(t) ? null : t / 1000;
}

/** A bare number or `{ qty, units }`; energy in kJ comes back as kcal. */
function qty(v: unknown): number | null {
  const o = v as { qty?: unknown; units?: unknown } | null;
  const n = typeof v === "number" ? v : o?.qty;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return o?.units === "kJ" ? n / 4.184 : n;
}

/** The strings carry the phone's zone, so their first ten characters are its local day. */
function dayOf(p: Point): string | null {
  const d = p.date ?? p.startDate ?? p.start;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

function byDay<T>(points: T[], day: (p: T) => string | null) {
  const out = new Map<string, T[]>();
  for (const p of points) {
    const d = day(p);
    if (d) out.set(d, [...(out.get(d) ?? []), p]);
  }
  return out;
}

const minutes = (hours: number | null) => (hours == null ? undefined : hours * 60);

export function appleHealthToEdge(push: AppleHealthPush): EdgePush {
  const days = new Map<string, EdgePush["days"][number]>();
  const at = (date: string) => days.get(date) ?? days.set(date, { date }).get(date)!;
  const metric = (name: string) => push.data.metrics.find((m) => m.name === name)?.data ?? [];
  const daily = (name: string, key: "resting_hr" | "hrv" | "resp_rate" | "active_calories", fold: (xs: number[]) => number) => {
    const units = push.data.metrics.find((m) => m.name === name)?.units;
    for (const [d, ps] of byDay(metric(name), dayOf)) {
      const xs = ps.flatMap((p) => qty({ units, ...p }) ?? []);
      if (xs.length > 0) at(d)[key] = fold(xs);
    }
  };
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  daily("resting_heart_rate", "resting_hr", (xs) => xs.at(-1)!);
  daily("heart_rate_variability", "hrv", (xs) => sum(xs) / xs.length);
  daily("respiratory_rate", "resp_rate", (xs) => sum(xs) / xs.length);
  daily("active_energy", "active_calories", (xs) => Math.round(sum(xs)));

  // Aggregated: one point per night, dated the morning it ended, hours throughout.
  for (const p of metric("sleep_analysis")) {
    const d = typeof p.date === "string" ? p.date.slice(0, 10) : null;
    const asleep = qty(p.totalSleep) ?? qty(p.asleep);
    if (!d || asleep == null || p.startDate != null) continue;
    const inBed = qty(p.inBed);
    Object.assign(at(d), {
      sleep_min: asleep * 60,
      deep_min: minutes(qty(p.deep)),
      rem_min: minutes(qty(p.rem)),
      light_min: minutes(qty(p.core)),
      sleep_efficiency: inBed ? (asleep / inBed) * 100 : undefined,
      sleep_start: epoch(p.inBedStart) ?? epoch(p.sleepStart),
      sleep_end: epoch(p.inBedEnd) ?? epoch(p.sleepEnd),
    });
  }

  const workouts = push.data.workouts.flatMap((w) => {
    const start = epoch(w.start);
    if (start == null || typeof w.id !== "string") return [];
    const hr = w.heartRate as { max?: unknown } | undefined;
    return [
      {
        id: w.id,
        start_ts: start,
        end_ts: epoch(w.end),
        type: typeof w.name === "string" ? w.name : null,
        calories: qty(w.activeEnergyBurned),
        max_hr: qty(w.maxHeartRate) ?? qty(hr?.max),
      },
    ];
  });

  return { days: [...days.values()], workouts };
}

/** Each metric's points for a day as one row, workouts whole under `workouts`. */
export function metricRows(push: AppleHealthPush): Row[] {
  const series = [...push.data.metrics, { name: "workouts", units: null, data: push.data.workouts }];
  return series.flatMap((m) =>
    [...byDay(m.data, dayOf)].map(([d, data]) =>
      row("metric", `edge-${m.name}-${d}`, `${d}T12:00:00Z`, null, null, m.name, { name: m.name, units: m.units ?? null, data }),
    ),
  );
}

/**
 * An export can carry only the points since the last one, so a day's row keeps
 * what it had and gains the new points, never loses them.
 */
export async function ingestAppleHealth(push: AppleHealthPush) {
  const metrics = metricRows(push);
  for (const r of metrics) {
    await db
      .insert(whoopRecords)
      .values(r)
      .onConflictDoUpdate({
        target: whoopRecords.id,
        set: {
          raw: sql`jsonb_set(excluded.raw, '{data}', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements((whoop_records.raw->'data') || (excluded.raw->'data')) x))`,
          fetchedAt: r.fetchedAt,
        },
      });
  }
  const scored = await storeRows(edgeRows(appleHealthToEdge(push)));
  return { ...scored, metrics: metrics.length };
}
