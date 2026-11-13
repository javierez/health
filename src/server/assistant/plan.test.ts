import { bandSilentSince, bedtimePlan, quietNight, clock, dueMessages, nightOver, nightsInARowUnder, type Night } from "./plan";

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
  dueMessages(at("2026-10-14T20:25:00Z"), { plan, lastWake: null, seen: null, sent: none }),
  [{ kind: "bedtime", day: "2026-10-14" }],
);
check(
  "an hour before: not yet",
  dueMessages(at("2026-10-14T19:55:00Z"), { plan, lastWake: null, seen: null, sent: none }),
  [],
);
check(
  "already sent tonight: never twice",
  dueMessages(at("2026-10-14T20:45:00Z"), { plan, lastWake: null, seen: null, sent: new Set(["bedtime:2026-10-14"]) }),
  [],
);

const late = bedtimePlan([night("2026-10-14T07:30:00Z", 480)]); // wake 09:30 → bed 01:15
check(
  "bedtime after midnight still belongs to the evening before",
  dueMessages(at("2026-10-14T23:00:00Z"), { plan: late, lastWake: null, seen: null, sent: none }),
  [{ kind: "bedtime", day: "2026-10-14" }],
);

check(
  "morning: 25 min after waking",
  dueMessages(at("2026-10-15T06:05:00Z"), { plan, lastWake: at("2026-10-15T05:40:00Z"), seen: at("2026-10-15T06:00:00Z"), sent: none }),
  [{ kind: "morning", day: "2026-10-15" }],
);
check(
  "morning: 10 min after waking is too soon",
  dueMessages(at("2026-10-15T05:50:00Z"), { plan, lastWake: at("2026-10-15T05:40:00Z"), seen: at("2026-10-15T05:50:00Z"), sent: none }),
  [],
);
check(
  "morning: a night sent while he sleeps is not a wake, however long ago",
  dueMessages(at("2026-10-22T03:20:00Z"), { plan, lastWake: at("2026-10-22T02:53:00Z"), seen: at("2026-10-22T02:58:00Z"), sent: none }),
  [],
);
check(
  "morning without WHOOP: at 10:00",
  dueMessages(at("2026-10-15T08:00:00Z"), { plan, lastWake: null, seen: null, sent: none }),
  [{ kind: "morning", day: "2026-10-15" }],
);

// 22-oct-2026, his usual wake-up 09:25: the night "ended" at 04:53 (02:53Z), a push at 05:20 saw it.
const his = bedtimePlan([night("2026-10-21T07:25:00Z"), night("2026-10-20T07:20:00Z"), night("2026-10-19T07:30:00Z")]);
check("his usual wake-up", clock(his.wakeMinutes), "09:25");
check(
  "22-oct: the night so far at 04:53, seen at 05:20, is not a morning",
  dueMessages(at("2026-10-22T03:20:00Z"), { plan: his, lastWake: at("2026-10-22T02:53:00Z"), seen: at("2026-10-22T03:20:00Z"), sent: none }),
  [],
);
check(
  "22-oct: the real end at 08:40, seen at 09:05, is",
  dueMessages(at("2026-10-22T07:05:00Z"), { plan: his, lastWake: at("2026-10-22T06:40:00Z"), seen: at("2026-10-22T07:05:00Z"), sent: none }),
  [{ kind: "morning", day: "2026-10-22" }],
);
check(
  "22-oct: with the band silent, 10:00 still sends it",
  dueMessages(at("2026-10-22T08:00:00Z"), { plan: his, lastWake: at("2026-10-22T02:53:00Z"), seen: at("2026-10-22T03:20:00Z"), sent: none }),
  [{ kind: "morning", day: "2026-10-22" }],
);
check("an early wake for a train (06:30) looks like the night so far: not over at 07:00", nightOver(at("2026-10-23T04:30:00Z"), at("2026-10-23T05:00:00Z"), his.wakeMinutes, at("2026-10-23T05:00:00Z")), false);
check("…and over at 10:00", nightOver(at("2026-10-23T04:30:00Z"), at("2026-10-23T05:00:00Z"), his.wakeMinutes, at("2026-10-23T08:00:00Z")), true);
check("…and over the next day", nightOver(at("2026-10-23T04:30:00Z"), at("2026-10-23T05:00:00Z"), his.wakeMinutes, at("2026-10-24T01:00:00Z")), true);
check("never over while the band has not seen him up", nightOver(at("2026-10-23T06:40:00Z"), at("2026-10-23T06:50:00Z"), his.wakeMinutes, at("2026-10-23T09:00:00Z")), false);

// 26-oct-2026, newest first: 6 h 39, 7 h 31, 6 h 53, 7 h 06, 6 h 55, 6 h 39. The note said «sexta noche seguida».
check("one night under 7 h, not six", nightsInARowUnder([399, 451, 413, 426, 415, 399]), 1);
check("a run of three", nightsInARowUnder([399, 413, 415, 451]), 3);
check("all of them", nightsInARowUnder([399, 413]), 2);
check("an unknown night ends the run", nightsInARowUnder([399, null, 399]), 1);
check("last night was long", nightsInARowUnder([480, 399]), 0);

// 31-oct to 7-nov-2026: Edge kept posting, but no night after 31-oct (ended 09:28, needed 9 h 31).
const stale = [night("2026-10-31T08:28:00Z", 571)];
check("silent band: the last night's end", bandSilentSince(stale, at("2026-11-06T09:00:00Z"))?.toISOString(), "2026-10-31T08:28:00.000Z");
check("a night that ended this morning is not silence", bandSilentSince(stale, at("2026-10-31T22:00:00Z")), null);
check("no nights at all is not silence", bandSilentSince([], at("2026-11-06T09:00:00Z")), null);
check("silent band: tonight's need is not the week-old one", bedtimePlan(stale, null, at("2026-11-06T22:00:00Z")).needMinutes, 480);
check("fresh band: the latest night's need", bedtimePlan(stale, null, at("2026-10-31T22:00:00Z")).needMinutes, 571);

// His messages on the night to 6-nov-2026 (Madrid UTC+1): 23:22, then 08:23. The 01:10 one ends the evening.
const msgs = [at("2026-11-05T19:00:00Z"), at("2026-11-05T22:22:00Z"), at("2026-11-06T07:23:00Z"), at("2026-11-06T09:00:00Z")];
check("quiet night: last message → first one", quietNight(msgs, "2026-11-06")?.minutes, 541);
check("a message at 01:10 is still the evening", quietNight([...msgs, at("2026-11-06T00:10:00Z")], "2026-11-06")?.minutes, 433);
check("no message in the morning yet: nothing", quietNight([at("2026-11-05T22:22:00Z")], "2026-11-06"), null);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
