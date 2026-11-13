import { buildDays, type RecordRow } from "./days";
import { healthspan, paceOfAging, pillarValues } from "./healthspan";
import { stampMs, stressSeries } from "./intraday";
import { cardioMinutes, exerciseWeeks, regularity, socialWeeks, stepDays, vo2Months } from "./longevity";
import { bedtimePlan, weeklyPlan } from "./plan";
import { compare, METRICS, trend } from "./stats";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const at = (iso: string) => new Date(iso);
const ms = (min: number) => min * 60_000;
const row = (r: Partial<RecordRow> & { kind: string; externalId: string }): RecordRow => ({ startAt: null, endAt: null, score: null, label: null, raw: {}, ...r });

// One WHOOP night into 20-oct (00:00 → 07:30 Madrid), then Edge's into 21-oct, half an hour later on both ends.
const rows: RecordRow[] = [
  row({
    kind: "sleep",
    externalId: "s1",
    startAt: at("2026-10-19T22:00:00Z"),
    endAt: at("2026-10-20T05:30:00Z"),
    raw: {
      score: {
        stage_summary: { total_in_bed_time_milli: ms(450), total_awake_time_milli: ms(10), total_light_sleep_time_milli: ms(240), total_slow_wave_sleep_time_milli: ms(100), total_rem_sleep_time_milli: ms(100) },
        sleep_needed: { baseline_milli: ms(460), need_from_sleep_debt_milli: ms(20), need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 },
        sleep_efficiency_percentage: 92,
        sleep_performance_percentage: 92,
      },
    },
  }),
  row({ kind: "recovery", externalId: "r1", startAt: at("2026-10-20T05:31:00Z"), raw: { score: { recovery_score: 71, hrv_rmssd_milli: 64, resting_heart_rate: 52 } } }),
  // Opens at 23:00 Madrid the night before: six hours on, it is the 20th.
  row({ kind: "cycle", externalId: "c1", startAt: at("2026-10-19T21:00:00Z"), raw: { score: { strain: 12, kilojoule: 8368 }, step_count: 9000 } }),
  row({
    kind: "workout",
    externalId: "w1",
    startAt: at("2026-10-20T16:00:00Z"),
    endAt: at("2026-10-20T17:00:00Z"),
    label: "weightlifting",
    raw: { score: { strain: 9, zone_durations: { zone_zero_milli: 0, zone_one_milli: ms(20), zone_two_milli: ms(15), zone_three_milli: ms(5), zone_four_milli: ms(3), zone_five_milli: ms(1) } } },
  }),
  row({
    kind: "sleep",
    externalId: "edge-sleep-2026-10-21",
    startAt: at("2026-10-20T22:30:00Z"),
    endAt: at("2026-10-21T06:00:00Z"),
    raw: { score: { stage_summary: { total_in_bed_time_milli: ms(450), total_light_sleep_time_milli: ms(220), total_slow_wave_sleep_time_milli: ms(100), total_rem_sleep_time_milli: ms(100) } } },
  }),
];
const days = buildDays(rows);
const d20 = days.find((d) => d.day === "2026-10-20")!;
const d21 = days.find((d) => d.day === "2026-10-21")!;

check("days: one per morning", days.map((d) => d.day), ["2026-10-20", "2026-10-21"]);
check("night, recovery and cycle land on the 20th", [d20.night?.sleepMin, d20.recovery, d20.strain, d20.steps, d20.kcal], [440, 71, 12, 9000, 2000]);
check("WHOOP's need is baseline plus debt", [d20.night?.neededMin, d20.night?.debtMin], [480, 20]);
check("workout: zones and strength", [d20.z13Min, d20.z45Min, d20.strengthMin], [40, 4, 60]);

// Edge's night: its need and performance come filled on the row (server/edge/fill.ts), so none here.
check("edge night is flagged", d21.night?.edge, true);
check("edge night: efficiency, no need made up here", [d21.night?.neededMin, d21.night?.performance, d21.night?.efficiency], [null, null, 93]);
check("edge night: 30 min later on both ends is 76 % consistent", d21.night?.consistency, 76);
check("edge night: its deep and REM are not compared with WHOOP's", [METRICS.restorative.get(d21), METRICS.restorativeHours.get(d21)], [null, null]);
check("WHOOP's day is tracked, Edge's alone is not", [d20.tracked, d21.tracked], [true, false]);

// Effort over Edge's days alone is unknown, not 0: it detects no workout.
const edgeOnly = Array.from({ length: 20 }, (_, i) => ({ ...d21, day: `2026-11-${String(i + 1).padStart(2, "0")}`, strain: 8, tracked: false }));
check("Edge alone: no zones nor strength", ["z13", "z45", "strength"].map((k) => k in pillarValues(edgeOnly, "2026-11-20", 30, null)), [false, false, false]);
const mixed = edgeOnly.map((d, i) => (i < 10 ? { ...d, tracked: true, z13Min: 60 } : d));
check("tracked days alone set the week: 1 h a day is 7 h", pillarValues(mixed, "2026-11-20", 30, null).z13, 7);

// Healthspan: the reference adult is 0; 10 bpm under resting pulse is −0.6 years.
const ref = { sleep: 7.5, steps: 6000, rhr: 68, z13: 2 };
check("reference adult is 0 years", healthspan(ref, null)?.delta, 0);
check("fewer than four habits: nothing", healthspan({ sleep: 7.5, steps: 6000, rhr: 68 }, null), null);
const fit = healthspan({ ...ref, rhr: 58 }, null)!;
check("10 bpm lower resting pulse", Math.round(fit.delta * 100) / 100, -0.6);
check("rows add up to the headline", Math.round(fit.contributions.reduce((a, c) => a + c.years, 0) * 100), Math.round(fit.delta * 100));
check("VO₂ needs the age", healthspan({ ...ref, vo2: 55 }, null)?.contributions.some((c) => c.key === "vo2"), false);

const weeks = (f: (i: number) => number | null) => Array.from({ length: 26 }, (_, i) => ({ day: `w${i}`, delta: f(i) }));
check("flat delta ages with the calendar", paceOfAging(weeks(() => -2)), 1);
check("losing a year a year is 0.0x", Math.round(paceOfAging(weeks((i) => (-i * 7) / 365))! * 100) / 100, 0);
check("under 60 days: no pace", paceOfAging(weeks((i) => (i < 23 ? null : 1))), null);

check("Edge's stamp", stampMs("2026-10-20 08:00:00 +0200"), Date.UTC(2026, 9, 20, 6));
check("bad stamp", stampMs("ayer"), null);

// Rest 50, max 190: 45 % of the reserve is 63 bpm, so 113 reads 3 and resting reads 0.
const minute = (i: number, bpm: number) => ({ t: Date.UTC(2026, 9, 20, 8, i), bpm });
const calm = stressSeries(Array.from({ length: 30 }, (_, i) => minute(i, 50)), 50, 190, []);
const hard = stressSeries(Array.from({ length: 30 }, (_, i) => minute(i, 120)), 50, 190, []);
check("resting pulse is no stress", calm.every((p) => p.value === 0), true);
check("pulse past 45 % of the reserve caps at 3", hard.every((p) => p.value === 3), true);
check("sleep and workouts are left out", stressSeries([minute(0, 120)], 50, 190, [{ start: Date.UTC(2026, 9, 20, 7), end: Date.UTC(2026, 9, 20, 9) }]), []);

check("zone time is a weekly total", trend(days, "z13", "W", "2026-10-21").value, 40 / 60);
check("lower resting pulse is better", compare([...Array.from({ length: 10 }, (_, i) => ({ ...d20, day: `2026-10-0${i}`, rhr: 60 })), { ...d20, day: "2026-10-20", rhr: 50 }], "rhr", "2026-10-20").better, true);

const plan = weeklyPlan(days, "2026-10-21");
check("steps goal counts the day hit", plan.goals[0]?.done, 1);
check("strength gathers minutes", plan.goals.find((g) => g.label === "Fuerza")?.done, 60);

// Need 480 − 20 + half of 40 short = 480; at 92 % efficiency that is 522 min in bed before 07:30: 22:48.
const bed = bedtimePlan(days, "2026-10-20", 100);
check("bedtime for a full night", [bed?.needMin, bed?.inBedMin, bed?.bed, bed?.wake], [480, 522, 22 * 60 + 48, 7 * 60 + 30]);

// Longevidad. VO₂: 15.3 × 187 / 52 ≈ 55, 14 × 187 / 52 ≈ 50.
const vo2 = vo2Months(days, 187);
check("VO₂ band for the month", vo2.map((m) => [m.month, Math.round(m.high), Math.round(m.low)]), [["2026-10", 55, 50]]);
check("no max pulse, no VO₂", vo2Months(days, null), []);
const ex = exerciseWeeks(days, "2026-10-21", 2);
check("exercise: last rolling week", [ex[1]?.moderate, ex[1]?.vigorous, ex[1]?.strength], [40, 4, 60]);
check("vigorous counts double", cardioMinutes(ex[1]!), 48);
check("an earlier empty week is zero, not missing", ex[0]?.moderate, 0);
check("steps: band-off days left out", stepDays([...days, { ...d20, day: "2026-10-19", steps: 400 }], "2026-10-21").map((x) => x.day), ["2026-10-20"]);
const social = socialWeeks(
  [
    { day: "2026-10-20", counterpart: "family", minutes: 90 },
    { day: "2026-10-19", counterpart: "friend", minutes: 30 },
    { day: "2026-10-18", counterpart: "client", minutes: 120 },
  ],
  "2026-10-21",
  3,
);
check("social: weeks heard nothing are left out", social.length, 1);
check("social: hours by group", social[0]?.hours, { family: 1.5, friend: 0.5, work: 2 });
// Bed 00:00 and 00:30 Madrid, wake 07:30 and 08:00.
check("regularity: bed after midnight stays small", regularity(days, "2026-10-21").nights.map((n) => [n.bed, n.wake]), [[0, 450], [30, 480]]);

console.log(`whoop: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
