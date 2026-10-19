import { sameNumber } from "./handle";
import { frameRate, MAX_FRAMES, parseDuration } from "./media";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("his number with and without 34", sameNumber("34636036116", "636036116"), true);
check("with + and spaces", sameNumber("+34 636 03 61 16", "34636036116"), true);
check("someone else", sameNumber("34621339327", "34636036116"), false);
check("an empty setting matches nobody", sameNumber("", undefined), false);

check(
  "ffmpeg's length line",
  parseDuration("  Duration: 00:01:02.50, start: 0.000000, bitrate: 2048 kb/s"),
  62.5,
);
check("no length line", parseDuration("Invalid data found"), null);
check("a short set: three frames a second", frameRate(12), 3);
check("a 30 s set: two a second, 60 frames", frameRate(30), 2);
check("a long video: capped at MAX_FRAMES", Math.round(frameRate(180) * 180), MAX_FRAMES);
check("unknown length: one a second", frameRate(null), 1);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
