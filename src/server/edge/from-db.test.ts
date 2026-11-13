import { appleHealthToEdge, metricRows } from "./apple-health";
import { edgeDbExtras, edgeDbPush, stamp } from "./from-db";
import { edgeRows } from "./ingest";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// Edge's database, as `scripts/import-edge-db.ts` reads it: the night of 19→20 oct.
const onset = Date.UTC(2026, 9, 19, 21, 30) / 1000;
const wake = Date.UTC(2026, 9, 20, 5, 30) / 1000;
const rows = {
  daily: [{ date: "2026-10-20", resting_hr: 51, hrv: 68.5, readiness: null, strain: 9.2, sleep_min: 420, deep_min: 90, rem_min: 100, light_min: 230, stress: 31, skin_temp_z: 0.4 }],
  windows: [
    { day_id: "2026-10-20", window_json: "{}" },
    { day_id: "2026-10-20", window_json: JSON.stringify({ onset_ms: onset * 1000, offset_ms: wake * 1000 }) },
  ],
  sessions: [
    { id: 3, start_ts: wake + 3600, end_ts: wake + 7200, type: "Running", status: "done", strain: 8.1, calories: 400, max_hr: 168 },
    { id: 4, start_ts: wake + 9000, end_ts: null, type: "Cycling", status: "live" },
  ],
  minutes: [
    { t: Date.UTC(2026, 9, 19, 19, 7) / 1000, min: 55, avg: 59, max: 73 },
    { t: Date.UTC(2026, 9, 20, 6, 0) / 1000, min: 60, avg: 62, max: 66 },
  ],
};

check("a Madrid stamp in summer time", stamp(Date.UTC(2026, 9, 20, 6, 0) / 1000), "2026-10-20 08:00:00 +0200");
check("and in winter time", stamp(Date.UTC(2026, 10, 2, 7, 0) / 1000), "2026-11-02 08:00:00 +0100");

const push = edgeDbPush(rows);
check("the last computed window gives the night its start and end", [push.days[0]!.sleep_start, push.days[0]!.sleep_end], [onset, wake]);
check("a missing readiness stays missing", push.days[0]!.readiness, null);
check("a workout still recording is left out", push.workouts.map((w) => w.id), [3]);
check("the file's night becomes WHOOP's rows", edgeRows(push).map((r) => r.id), [
  "cycle:edge-2026-10-20",
  "sleep:edge-2026-10-20",
  "recovery:edge-2026-10-20",
  "workout:edge-3",
]);

const extras = edgeDbExtras(rows);
check("one body per Madrid day", extras.length, 2);
const metrics = extras.flatMap(metricRows).map((r) => r.id);
check("minutes and the whole daily row land as metric rows", metrics, [
  "metric:edge-heart_rate-2026-10-19",
  "metric:edge-heart_rate-2026-10-20",
  "metric:edge-edge_daily-2026-10-20",
]);
check("the daily row keeps what WHOOP has no room for", (extras[1]!.data.metrics[1]!.data[0] as { stress: number }).stress, 31);
check("the extras never invent a night", extras.flatMap((b) => appleHealthToEdge(b).days.filter((d) => Object.keys(d).length > 1)), []);

if (failures.length > 0) {
  console.error(`edge db: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`edge db: ${passed} passed`);
