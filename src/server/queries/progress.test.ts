import { parseWritten } from "~/server/assistant/write";
import { delta, WEEKS, weekIndex, workCalls } from "./progress";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("the anchor day is this week", weekIndex("2026-09-07", "2026-09-07"), WEEKS - 1);
check("six days back is still this week", weekIndex("2026-09-01", "2026-09-07"), WEEKS - 1);
check("seven days back is last week", weekIndex("2026-08-31", "2026-09-07"), WEEKS - 2);
check("after the anchor: outside", weekIndex("2026-09-08", "2026-09-07"), null);
check("before the twelve weeks: outside", weekIndex("2026-06-14", "2026-09-07"), null);

check("against the mean of the four before", delta([null, 10, 10, 10, 10, 12]), { up: true, text: "▲ 20 %" });
check("down", delta([8, 8, 8, 8, 6]), { up: false, text: "▼ 25 %" });
check("under 1 % is no change", delta([100, 100, 100, 100, 100.5]), { up: true, text: "= igual" });
check("nothing this week, no pill", delta([8, 8, 8, 8, null]), null);
check("nothing before, no pill", delta([null, null, null, null, 5]), null);

const ep = (recordingId: string, call: number | null, category = "business", seconds = 60, day = "2026-09-07") => ({
  recordingId,
  call,
  category,
  day,
  seconds,
});
check(
  "two calls in one recording are two",
  workCalls([ep("a", 1), ep("a", 2)]).length,
  2,
);
check(
  "one call over several episodes is one, with all its minutes",
  workCalls([ep("a", 1), ep("a", 1, "personal", 30), ep("a", 1)]),
  [{ day: "2026-09-07", seconds: 150 }],
);
check("the same number in another recording is another call", workCalls([ep("a", 1), ep("b", 1)]).length, 2);
check("a personal call is not work", workCalls([ep("a", 1, "personal"), ep("a", 2)]).length, 1);
check("off-call stretches are not calls", workCalls([ep("a", null), ep("a", null)]).length, 0);

const written = parseWritten({
  message: "Hoy suave —  recuperación 39 %.\nA dormir pronto.",
  items: [
    { area: "training", title: "Entreno suave", detail: "Recuperación 39 %" },
    { area: "money", title: "x", detail: "y" },
    { area: "sleep", title: "Nada de pantallas desde las 22:00" },
  ],
});
check("its lines kept, no dashes", written.text, "Hoy suave, recuperación 39 %.\nA dormir pronto.");
check("an off-list area is dropped", written.items.length, 2);
check("a missing detail is empty, not the item", written.items[1]?.detail, "");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
