import { createHash } from "node:crypto";
import { and, gte, inArray, lt, notLike } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { edgePushes, whoopRecords } from "~/db/schema";
import { row, type Row } from "~/server/whoop/sync";
import { fillIn } from "./fill";

/**
 * The band without the subscription: OpenStrap Edge reads the WHOOP strap over
 * Bluetooth on the phone and posts its own numbers here after every sync.
 *
 * They are stored as `whoop_records` in WHOOP's v2 shape, so everything that
 * reads WHOOP (the chat, the panel, the findings) reads them unchanged. Ids are
 * `edge-…`, never WHOOP's. A day WHOOP has already scored keeps WHOOP's row, and
 * `whoop/sync.ts` drops a stand-in when WHOOP's own arrives.
 *
 * Edge has no sleep need, performance or (so far) recovery score: `fill.ts`
 * works them out from his history before the row is stored, and marks the
 * row `estimated`.
 */
const num = z.number().finite().nullish();

export const edgePushSchema = z.object({
  days: z
    .array(
      z.object({
        /** `YYYY-MM-DD`, the day you woke into. */
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        readiness: num,
        resting_hr: num,
        hrv: num,
        resp_rate: num,
        strain: num,
        active_calories: num,
        sleep_min: num,
        deep_min: num,
        rem_min: num,
        light_min: num,
        sleep_efficiency: num,
        /** Epoch seconds of the night that ended that morning. */
        sleep_start: num,
        sleep_end: num,
      }),
    )
    .default([]),
  workouts: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        start_ts: z.number(),
        end_ts: num,
        type: z.string().nullish(),
        strain: num,
        calories: num,
        max_hr: num,
      }),
    )
    .default([]),
});
export type EdgePush = z.infer<typeof edgePushSchema>;

const iso = (sec: number) => new Date(sec * 1000).toISOString();
const milli = (min: number | null | undefined) => (min == null ? undefined : Math.round(min * 60_000));

export function edgeRows(push: EdgePush): Row[] {
  const rows: Row[] = [];
  for (const d of push.days) {
    const id = `edge-${d.date}`;
    const start = d.sleep_start ? iso(d.sleep_start) : null;
    const end = d.sleep_end ? iso(d.sleep_end) : null;

    if (d.strain != null) {
      // WHOOP's cycle opens when you fall asleep and holds the day after it. No
      // `kilojoule`: WHOOP's is the whole day's energy, Edge's calories only the
      // active ones (17 kcal on 24-oct-2026 read as the day's).
      const raw = { id, start: start ?? `${d.date}T00:00:00Z`, end: null, score_state: "SCORED", score: { strain: d.strain } };
      rows.push(row("cycle", id, raw.start, null, d.strain, "SCORED", raw));
    }

    if (start && end && d.sleep_min != null) {
      const inBed = (d.sleep_end! - d.sleep_start!) * 1000;
      const raw = {
        id,
        start,
        end,
        nap: false,
        score_state: "SCORED",
        score: {
          stage_summary: {
            total_in_bed_time_milli: inBed,
            total_awake_time_milli: Math.max(0, inBed - milli(d.sleep_min)!),
            total_light_sleep_time_milli: milli(d.light_min),
            total_slow_wave_sleep_time_milli: milli(d.deep_min),
            total_rem_sleep_time_milli: milli(d.rem_min),
          },
          sleep_efficiency_percentage: d.sleep_efficiency ?? undefined,
          respiratory_rate: d.resp_rate ?? undefined,
        },
      };
      rows.push(row("sleep", id, start, end, null, "SCORED", raw));
    }

    if (d.readiness != null || d.hrv != null || d.resting_hr != null) {
      const created = end ?? `${d.date}T10:00:00Z`;
      const raw = {
        cycle_id: id,
        created_at: created,
        score_state: "SCORED",
        score: { recovery_score: d.readiness ?? undefined, resting_heart_rate: d.resting_hr ?? undefined, hrv_rmssd_milli: d.hrv ?? undefined },
      };
      rows.push(row("recovery", id, created, null, d.readiness ?? null, "SCORED", raw));
    }
  }

  for (const w of push.workouts) {
    const id = `edge-${w.id}`;
    const start = iso(w.start_ts);
    const end = w.end_ts ? iso(w.end_ts) : null;
    const raw = {
      id,
      start,
      end,
      sport_name: w.type ?? null,
      score_state: "SCORED",
      score: { strain: w.strain ?? undefined, kilojoule: w.calories == null ? undefined : w.calories * 4.184, max_heart_rate: w.max_hr ?? undefined },
    };
    rows.push(row("workout", id, start, end, w.strain ?? null, w.type ?? null, raw));
  }
  return rows;
}

/** Stores what WHOOP has not already scored. Upsert: Edge re-sends the last days on every sync. */
export function ingestEdge(push: EdgePush) {
  return storeRows(edgeRows(push));
}

/** The body as it came, once per distinct body (`edge_pushes`). */
export async function keepPush(text: string, body: unknown) {
  const hash = createHash("sha256").update(text).digest("hex");
  await db.insert(edgePushes).values({ hash, body }).onConflictDoNothing();
}

/** The nights and mornings before: what a need and a recovery are worked out against. */
const HISTORY_MS = 45 * 86_400_000;

export async function storeRows(rows: Row[]): Promise<{ stored: number; skipped: number }> {
  const days = [...new Set(rows.flatMap((r) => (r.day ? [r.day] : [])))];
  const whoop =
    days.length === 0
      ? []
      : await db
          .select({ kind: whoopRecords.kind, day: whoopRecords.day })
          .from(whoopRecords)
          .where(and(notLike(whoopRecords.externalId, "edge-%"), inArray(whoopRecords.day, days)));
  const taken = new Set(whoop.map((w) => `${w.kind}|${w.day}`));
  const starts = rows.flatMap((r) => (r.startAt ? [r.startAt.getTime()] : []));
  const past =
    starts.length === 0
      ? []
      : await db
          .select({ kind: whoopRecords.kind, externalId: whoopRecords.externalId, startAt: whoopRecords.startAt, raw: whoopRecords.raw })
          .from(whoopRecords)
          .where(
            and(
              inArray(whoopRecords.kind, ["sleep", "recovery"]),
              gte(whoopRecords.startAt, new Date(Math.min(...starts) - HISTORY_MS)),
              lt(whoopRecords.startAt, new Date(Math.max(...starts))),
            ),
          );
  const fresh = fillIn(rows.filter((r) => !taken.has(`${r.kind}|${r.day}`)), past);
  for (const r of fresh) {
    await db.insert(whoopRecords).values(r).onConflictDoUpdate({ target: [whoopRecords.userId, whoopRecords.id], set: r });
  }
  return { stored: fresh.length, skipped: rows.length - fresh.length };
}
