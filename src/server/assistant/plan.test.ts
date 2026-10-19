import { bedtimePlan, clock, dueMessages, type Night } from "./plan";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// Madrid is UTC+2 in October 2026.
const at = (iso: string) => new Date(iso);
const night = (end: string, need: number | null = 480): Night => ({
  start: new Date(at(end).getTime() - 8 * 3_600_000),
  end: at(end),
  needMinutes: need,
});

const plan = bedtimePlan([
  night("2026-10-13T05:30:00Z"), // 07:30
  night("2026-10-12T05:45:00Z"), // 07:45
  night("2026-10-14T05:40:00Z", 510), // 07:40, the latest: 8 h 30 needed
  night("2026-10-11T09:00:00Z"), // 11:00 Sunday, ignored by the median
]);
check("wake = median of the nights", clock(plan.wakeMinutes), "07:45");
check("need = the latest night's", plan.needMinutes, 510);
check("bed = wake − need − 15", clock(plan.bedMinutes), "23:00");

check("no nights: 07:30 − 8 h − 15 min", clock(bedtimePlan([]).bedMinutes), "23:15");

// He goes to bed at ~02:37 and WHOOP's ideal is 23:05: the target is a step, not the ideal.
const owl = (end: string, bed: string): Night => ({ start: at(bed), end: at(end), needMinutes: 581 });
const owls = [
  owl("2026-10-14T07:01:00Z", "2026-10-14T00:37:00Z"),
  owl("2026-10-13T07:01:00Z", "2026-10-13T00:30:00Z"),
  owl("2026-10-12T07:01:00Z", "2026-10-12T00:50:00Z"),
];
const step = bedtimePlan(owls);
check("an owl: half an hour before his usual 02:37, on the half hour", clock(step.bedMinutes), "02:00");
check("an owl: the ideal is kept", clock(step.idealMinutes), "23:05");
check("an owl with a 01:00 cap: the cap wins", clock(bedtimePlan(owls, 60).bedMinutes), "01:00");
check("a 03:00 cap never moves an earlier step", clock(bedtimePlan(owls, 180).bedMinutes), "02:00");
check("45 min past the ideal: no step, the ideal", clock(plan.bedMinutes), "23:00");

const none = new Set<string>();
check(
  "35 min before bedtime: due, keyed on the evening",
  dueMessages(at("2026-10-14T20:25:00Z"), { plan, lastWake: null, sent: none }),
  [{ kind: "bedtime", day: "2026-10-14" }],
);
check(
  "an hour before: not yet",
  dueMessages(at("2026-10-14T19:55:00Z"), { plan, lastWake: null, sent: none }),
  [],
);
check(
  "already sent tonight: never twice",
  dueMessages(at("2026-10-14T20:45:00Z"), { plan, lastWake: null, sent: new Set(["bedtime:2026-10-14"]) }),
  [],
);

const late = bedtimePlan([night("2026-10-14T07:30:00Z", 480)]); // wake 09:30 → bed 01:15
check(
  "bedtime after midnight still belongs to the evening before",
  dueMessages(at("2026-10-14T23:00:00Z"), { plan: late, lastWake: null, sent: none }),
  [{ kind: "bedtime", day: "2026-10-14" }],
);

check(
  "morning: 25 min after waking",
  dueMessages(at("2026-10-15T06:05:00Z"), { plan, lastWake: at("2026-10-15T05:40:00Z"), sent: none }),
  [{ kind: "morning", day: "2026-10-15" }],
);
check(
  "morning: 10 min after waking is too soon",
  dueMessages(at("2026-10-15T05:50:00Z"), { plan, lastWake: at("2026-10-15T05:40:00Z"), sent: none }),
  [],
);
check(
  "morning without WHOOP: at 10:00",
  dueMessages(at("2026-10-15T08:00:00Z"), { plan, lastWake: null, sent: none }),
  [{ kind: "morning", day: "2026-10-15" }],
);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
