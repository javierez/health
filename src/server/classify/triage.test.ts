import { triage } from "./triage";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const kind = (t: string | null, secs: number | null) =>
  triage({ transcript: t, summaryMarkdown: null, durationSeconds: secs }).kind;

// Real rows from the corpus, measured 2026-09-06.
check('"Meta", 1s', kind("Meta.", 1), "noise");
check("silence, 2s", kind(null, 2), "noise");
check('"Queda claro, ok", 2s', kind("Queda claro, ok, perfecto.", 2), "noise");
check("155 chars, 23s", kind("x".repeat(155), 23), "noise");

// The one that must NOT be binned: audio exists, words do not.
check("40 chars over 619s", kind("x".repeat(40), 619), "failed-transcription");
check("exactly at the audio threshold", kind("x".repeat(10), 120), "failed-transcription");

// A real conversation.
check("642 chars, 42s", kind("x".repeat(642), 42), "classify");
check("exactly at the char threshold", kind("x".repeat(200), 5), "classify");
check("199 chars is still noise", kind("x".repeat(199), 5), "noise");

// Whitespace does not buy you a classification.
check("whitespace only", kind("   \n  \t ", 3), "noise");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
if (failures.length > 0) process.exitCode = 1;
