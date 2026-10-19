import { MOOD_QUESTION, withMoodAsk } from "./mood-ask";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const now = new Date("2026-10-19T08:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

check("morning, none told: asked", withMoodAsk("Dormiste 6 h.", "morning", null, now), `Dormiste 6 h. ${MOOD_QUESTION}`);
check("afternoon, told 5 h ago: asked", withMoodAsk("Te queda pierna.", "commitments", hoursAgo(5), now), `Te queda pierna. ${MOOD_QUESTION}`);
check("told an hour ago: not asked", withMoodAsk("Dormiste 6 h.", "morning", hoursAgo(1), now), "Dormiste 6 h.");
check("bedtime asks on its own", withMoodAsk("A la cama a las 00:30.", "bedtime", null, now), "A la cama a las 00:30.");

const long = withMoodAsk("x".repeat(700), "morning", null, now);
check("a full message still fits", [long.length <= 700, long.endsWith(MOOD_QUESTION)], [true, true]);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
