import { appleHealthSchema, appleHealthToEdge, epoch, metricRows } from "./apple-health";
import { edgeRows } from "./ingest";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// Health Auto Export, JSON v2, sleep aggregated: the night of 19→20 oct in Madrid.
const push = appleHealthSchema.parse({
  data: {
    metrics: [
      { name: "resting_heart_rate", units: "count/min", data: [{ date: "2026-10-20 00:00:00 +0200", qty: 51, source: "Edge" }] },
      {
        name: "heart_rate_variability",
        units: "ms",
        data: [
          { date: "2026-10-20 03:00:00 +0200", qty: 60, source: "Edge" },
          { date: "2026-10-20 05:00:00 +0200", qty: 70, source: "Edge" },
        ],
      },
      { name: "active_energy", units: "kJ", data: [{ date: "2026-10-20 10:00:00 +0200", qty: 418.4 }, { date: "2026-10-20 11:00:00 +0200", qty: 418.4 }] },
      {
        name: "sleep_analysis",
        units: "hr",
        data: [
          {
            date: "2026-10-20",
            totalSleep: 7,
            core: 4,
            deep: 1.5,
            rem: 1.5,
            inBed: 8,
            sleepStart: "2026-10-19 23:45:00 +0200",
            sleepEnd: "2026-10-20 07:15:00 +0200",
            inBedStart: "2026-10-19 23:30:00 +0200",
            inBedEnd: "2026-10-20 07:30:00 +0200",
          },
        ],
      },
      {
        name: "heart_rate",
        units: "bpm",
        data: [
          { date: "2026-10-19 21:07:00 +0200", Min: 55, Avg: 59, Max: 73 },
          { date: "2026-10-20 08:00:00 +0200", Min: 60, Avg: 64, Max: 70 },
        ],
      },
    ],
    workouts: [
      {
        id: "W1",
        name: "Running",
        start: "2026-10-20 18:00:00 +0200",
        end: "2026-10-20 19:00:00 +0200",
        duration: 3600,
        activeEnergyBurned: { qty: 480, units: "kcal" },
        heartRate: { max: { qty: 171, units: "bpm" } },
      },
    ],
  },
});

check("the export's date reads in its own zone", epoch("2026-10-20 07:30:00 +0200"), Date.UTC(2026, 9, 20, 5, 30) / 1000);

const edge = appleHealthToEdge(push);
const day = edge.days.find((d) => d.date === "2026-10-20")!;
check("a morning carries the night and its recovery inputs", day, {
  date: "2026-10-20",
  resting_hr: 51,
  hrv: 65,
  active_calories: 200,
  sleep_min: 420,
  deep_min: 90,
  rem_min: 90,
  light_min: 240,
  sleep_efficiency: 87.5,
  sleep_start: Date.UTC(2026, 9, 19, 21, 30) / 1000,
  sleep_end: Date.UTC(2026, 9, 20, 5, 30) / 1000,
});
check("heart rate alone makes no summary day", edge.days.map((d) => d.date), ["2026-10-20"]);
check("a workout keeps its sport, calories and peak", edge.workouts, [
  { id: "W1", start_ts: Date.UTC(2026, 9, 20, 16) / 1000, end_ts: Date.UTC(2026, 9, 20, 17) / 1000, type: "Running", calories: 480, max_hr: 171 },
]);

const rows = edgeRows(edge);
check("the night becomes WHOOP's sleep, recovery and workout rows", rows.map((r) => r.id), [
  "sleep:edge-2026-10-20",
  "recovery:edge-2026-10-20",
  "workout:edge-W1",
]);
check("the night is filed under the evening it started", rows[0]!.day, "2026-10-19");

const metrics = metricRows(push);
check("every metric's day is kept whole, workouts too", metrics.map((r) => r.id), [
  "metric:edge-resting_heart_rate-2026-10-20",
  "metric:edge-heart_rate_variability-2026-10-20",
  "metric:edge-active_energy-2026-10-20",
  "metric:edge-sleep_analysis-2026-10-20",
  "metric:edge-heart_rate-2026-10-19",
  "metric:edge-heart_rate-2026-10-20",
  "metric:edge-workouts-2026-10-20",
]);
check("a metric row is the day it holds", metrics[4]!.day, "2026-10-19");
check("its points are untouched", (metrics[4]!.raw as { data: unknown[] }).data, [{ date: "2026-10-19 21:07:00 +0200", Min: 55, Avg: 59, Max: 73 }]);

check("an empty export stores nothing", metricRows(appleHealthSchema.parse({ data: {} })), []);
check("a body without data is refused", appleHealthSchema.safeParse({ metrics: [] }).success, false);

if (failures.length > 0) {
  console.error(`apple health: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`apple health: ${passed} passed`);
