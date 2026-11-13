import { fillIn, type Past } from "./fill";
import { edgePushSchema, edgeRows } from "./ingest";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const ms = (min: number) => min * 60_000;
const morning = (day: string) => new Date(`${day}T05:30:00Z`); // 07:30 Madrid
const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

// WHOOP's nights into 14…19-oct at the baseline, then one two hours short into the 20th.
const whoopNight = (n: number, asleep: number): Past => ({
  kind: "sleep",
  externalId: `s${n}`,
  startAt: new Date(morning(day(n)).getTime() - ms(asleep + 30)),
  raw: { score: { stage_summary: { total_in_bed_time_milli: ms(asleep + 30), total_awake_time_milli: ms(30) } } },
});
const whoopMorning = (n: number, hrv = 60, rhr = 52): Past => ({
  kind: "recovery",
  externalId: `r${n}`,
  startAt: morning(day(n)),
  raw: { score: { recovery_score: 70, hrv_rmssd_milli: hrv, resting_heart_rate: rhr } },
});
const nights = [14, 15, 16, 17, 18, 19].map((n) => whoopNight(n, 461)).concat(whoopNight(20, 341));
const mornings = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((n) => whoopMorning(n));

// Edge's push: the night into the 21st (7 h asleep of 8 in bed), HRV 50, pulse 55, no readiness.
const edgeDay = (n: number, sleep: number, extra: Record<string, number | null> = {}) => ({
  date: day(n),
  readiness: null,
  hrv: 50,
  resting_hr: 55,
  sleep_min: sleep,
  sleep_start: (morning(day(n)).getTime() - ms(480)) / 1000,
  sleep_end: morning(day(n)).getTime() / 1000,
  ...extra,
});
const push = (days: ReturnType<typeof edgeDay>[]) => edgeRows(edgePushSchema.parse({ days }));
const by = (rows: ReturnType<typeof fillIn>, id: string) => rows.find((r) => r.id === id)!;
const score = (r: { raw: unknown }) => (r.raw as { score: Record<string, unknown> }).score;
const debt = (r: { raw: unknown }) => (score(r).sleep_needed as { need_from_sleep_debt_milli: number }).need_from_sleep_debt_milli / 60_000;

const one = fillIn(push([edgeDay(21, 420)]), [...nights, ...mornings]);
const sleep = by(one, "sleep:edge-2026-10-21");
// Debt: half of the 2 h short the night before = 60. Need 461 + 60 = 521; 420 / 521 = 81 %.
check("edge night: debt from the nights before", debt(sleep), 60);
check("edge night: performance against that need", [score(sleep).sleep_performance_percentage, sleep.score], [81, 81]);
check("edge night: says it is estimated", (sleep.raw as { estimated?: boolean }).estimated, true);

// Recovery: 62.8 + 55.7 × ln(50 / 60) − 1.16 × (55 − 52) + 7.1 × (7 − 7) = 49.
const rec = by(one, "recovery:edge-2026-10-21");
check("edge morning: recovery from HRV, pulse and the night", [score(rec).recovery_score, rec.score], [49, 49]);
check("edge morning: says it is estimated", (rec.raw as { estimated?: boolean }).estimated, true);
check("edge morning: keeps the usual it was held against", (rec.raw as { usual?: unknown }).usual, { hrv: 60, rhr: 52 });

check(
  "Edge's own readiness, when it sends one, is kept",
  by(fillIn(push([edgeDay(21, 420, { readiness: 70 })]), [...nights, ...mornings]), "recovery:edge-2026-10-21").score,
  70,
);
check("fewer than ten mornings before: no recovery made up", by(fillIn(push([edgeDay(21, 420)]), [...nights, ...mornings.slice(0, 9)]), "recovery:edge-2026-10-21").score, null);

// Edge resends the 21st, now whole, with the 22nd. Stored from an earlier push: the 21st as 3 h 20 so far.
const stale: Past = { kind: "sleep", externalId: "edge-2026-10-21", startAt: sleep.startAt, raw: { score: { stage_summary: { total_in_bed_time_milli: ms(230), total_awake_time_milli: ms(30) } } } };
const two = fillIn(push([edgeDay(21, 420), edgeDay(22, 461)]), [...nights, stale, ...mornings]);
// 22nd: 41 short on the 21st + 120 short on the 20th × 0.7 = 125, half is 63. With the stale 200: 128.
check("what the push says wins over the stored night so far", debt(by(two, "sleep:edge-2026-10-22")), 63);

// Fourteen Edge mornings before: its HRV is held against its own (40), not WHOOP's (60).
const edgeMornings: Past[] = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => ({ ...whoopMorning(n + 10, 40, 55), externalId: `edge-${day(n + 10)}`, startAt: morning(`2026-10-${n + 10}`) }));
check(
  "Edge against Edge once it has two weeks",
  by(fillIn(push([edgeDay(31, 420, { hrv: 40, resting_hr: 55 })]), [...nights, ...mornings, ...edgeMornings]), "recovery:edge-2026-10-31").score,
  63,
);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
