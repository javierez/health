import { edgePushSchema, edgeRows } from "./ingest";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// 19-oct night: asleep 23:30 Madrid (21:30 UTC) on the 18th, up 07:30 on the 19th.
const onset = Date.UTC(2026, 9, 18, 21, 30) / 1000;
const wake = Date.UTC(2026, 9, 19, 5, 30) / 1000;
const push = edgePushSchema.parse({
  days: [
    {
      date: "2026-10-19",
      readiness: 62,
      resting_hr: 51,
      hrv: 68.5,
      resp_rate: 14.2,
      strain: 11.3,
      active_calories: 650,
      sleep_min: 420,
      deep_min: 90,
      rem_min: 100,
      light_min: 230,
      sleep_efficiency: 87.5,
      sleep_start: onset,
      sleep_end: wake,
    },
  ],
  workouts: [{ id: 7, start_ts: wake + 3 * 3600, end_ts: wake + 4 * 3600, type: "Running", strain: 9.1, calories: 480, max_hr: 171 }],
});
const rows = edgeRows(push);
const by = (kind: string) => rows.find((r) => r.kind === kind)!;

check("a full day gives cycle, sleep, recovery and the workout", rows.map((r) => r.id), [
  "cycle:edge-2026-10-19",
  "sleep:edge-2026-10-19",
  "recovery:edge-2026-10-19",
  "workout:edge-7",
]);

const sleep = by("sleep");
const stages = (sleep.raw as { score: { stage_summary: Record<string, number> } }).score.stage_summary;
check("the night is filed under the evening it started, like WHOOP", sleep.day, "2026-10-18");
check("eight hours in bed", stages.total_in_bed_time_milli, 8 * 3_600_000);
check("awake is in bed minus asleep", stages.total_awake_time_milli, 60 * 60_000);
check("deep becomes slow wave", stages.total_slow_wave_sleep_time_milli, 90 * 60_000);
check("no sleep need, so no performance score", sleep.score, null);

const rec = by("recovery");
check("recovery is the morning you woke into", rec.day, "2026-10-19");
check("recovery score and HRV in WHOOP's fields", (rec.raw as { score: unknown }).score, {
  recovery_score: 62,
  resting_heart_rate: 51,
  hrv_rmssd_milli: 68.5,
});
check("recovery score in the column", rec.score, 62);

check("the cycle opens at sleep onset and carries the strain", [by("cycle").startAt?.toISOString(), by("cycle").score], [
  new Date(onset * 1000).toISOString(),
  11.3,
]);
check("Edge's active calories are not WHOOP's whole-day kilojoules", (by("cycle").raw as { score: Record<string, unknown> }).score, { strain: 11.3 });

const w = by("workout");
check("a workout keeps its sport, strain and length", [w.label, w.score, w.durationSeconds], ["Running", 9.1, 3600]);

const bare = edgeRows(edgePushSchema.parse({ days: [{ date: "2026-10-20", resting_hr: 55 }] }));
check("a day with only a resting HR is a recovery row, no invented sleep or strain", bare.map((r) => r.kind), ["recovery"]);
check("nothing posted, nothing stored", edgeRows(edgePushSchema.parse({})), []);
check("a malformed date is refused", edgePushSchema.safeParse({ days: [{ date: "19/10/2026" }] }).success, false);

if (failures.length > 0) {
  console.error(`edge ingest: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`edge ingest: ${passed} passed`);
