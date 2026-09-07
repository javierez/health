import { normalise, type RawEpisode } from "./episodes";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const ep = (start: number, end: number, category: RawEpisode["category"] = "business"): RawEpisode => ({
  category,
  subcategory: null,
  confidence: 0.9,
  one_liner: "x",
  start_seconds: start,
  end_seconds: end,
  topics: [],
  people: [],
});

/** Every test asserts on spans, because spans are what the rollups sum. */
const spans = (raw: RawEpisode[], total: number) =>
  normalise(raw, total).map((e) => [e.startSeconds, e.endSeconds, e.category]);

check("clean input is left alone", spans([ep(0, 60), ep(60, 120)], 120), [
  [0, 60, "business"],
  [60, 120, "business"],
]);

// The 251 minutes this file exists to stop losing.
check("a gap over a minute becomes an explicit unattributed block", spans([ep(0, 60), ep(1982, 2400)], 2400), [
  [0, 60, "business"],
  [60, 1982, "ambient"],
  [1982, 2400, "business"],
]);

check("a gap under a minute extends the previous episode", spans([ep(0, 60), ep(95, 200)], 200), [
  [0, 95, "business"],
  [95, 200, "business"],
]);

// Clamping, from the failures observed on the real corpus.
check("an overlap is pushed to the previous end", spans([ep(0, 100), ep(40, 200)], 200), [
  [0, 100, "business"],
  [100, 200, "business"],
]);

check("an end past the duration is clamped", spans([ep(0, 9999)], 300), [[0, 300, "business"]]);

check("out-of-order input is sorted", spans([ep(100, 200), ep(0, 100)], 200), [
  [0, 100, "business"],
  [100, 200, "business"],
]);

check("a short tail extends the last episode", spans([ep(0, 260)], 300), [[0, 300, "business"]]);

check("a long tail becomes unattributed", spans([ep(0, 100)], 900), [
  [0, 100, "business"],
  [100, 900, "ambient"],
]);

// Coverage is the invariant everything downstream depends on.
const covered = normalise([ep(0, 50), ep(600, 700)], 1200);
check("episodes always cover 0..duration", [covered[0]!.startSeconds, covered.at(-1)!.endSeconds], [0, 1200]);
check(
  "and never leave a hole",
  covered.every((e, i) => i === 0 || e.startSeconds === covered[i - 1]!.endSeconds),
  true,
);

// The two shapes that cost us a whole recording each on the first full pass.
import { parseEpisodes, planWindows } from "./episodes";

const fromTags = parseEpisodes({
  episodes: [
    { category: "business", confidence: 0.9, one_liner: "x", start_seconds: 0, end_seconds: 60, topics: "vesting, cap table" },
  ],
});
check("topics as a comma string is split, not fatal", fromTags.ok && fromTags.data[0]!.topics, [
  "vesting",
  "cap table",
]);

const noConfidence = parseEpisodes({
  episodes: [{ category: "business", one_liner: "x", start_seconds: 0, end_seconds: 60 }],
});
check("a missing confidence defaults instead of failing", noConfidence.ok && noConfidence.data[0]!.confidence, 0.5);

const badCategory = parseEpisodes({
  episodes: [{ category: "gardening", confidence: 0.9, one_liner: "x", start_seconds: 0, end_seconds: 60 }],
});
check("but an unknown category still fails", badCategory.ok, false);

const badBounds = parseEpisodes({
  episodes: [{ category: "business", confidence: 0.9, one_liner: "x", start_seconds: "abc", end_seconds: 60 }],
});
check("and an unparseable boundary still fails", badBounds.ok, false);


/** The failure that lost `6ba10b8e` whole: a missing `people` key, not a bad one. */
const noPeople = parseEpisodes({
  episodes: [{ category: "business", confidence: 0.9, one_liner: "x", start_seconds: 0, end_seconds: 60 }],
});
check("a missing people key is empty, not Required", noPeople.ok && noPeople.data[0]!.people, []);

const turnsAt = (last: number) => [{ speaker: "SPEAKER_00", text: "hi", startSeconds: last }];
const asInput = (last: number, duration: number) => ({
  title: null, turns: turnsAt(last), transcript: null, summaryMarkdown: null,
  durationSeconds: duration, recordedAt: null,
});

check("a 40-minute recording is one call", planWindows(asInput(2_400, 2_400)).length, 0);
const long = planWindows(asInput(8_826, 9_132));
check("a 152-minute recording is sliced", long.length, 4);
check("the first slice starts at zero", long[0]!.start, 0);
check("the slices touch", long[1]!.start, long[0]!.end);
check("the last slice reaches past the end", long[3]!.end > 9_132, true);
check("no turns, no windows", planWindows({ ...asInput(0, 9_999), turns: [] }).length, 0);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
if (failures.length > 0) process.exitCode = 1;
