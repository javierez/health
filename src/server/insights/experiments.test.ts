import type { Day } from "./days";
import { dayOf, experimentResult, isOn } from "./experiments";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const plan = { startDay: "2026-10-19", days: 14, outcome: "recovery" };

check("the first day is on", isOn(plan, "2026-10-19"), true);
check("the second is off", isOn(plan, "2026-10-20"), false);
check("the day before is outside", isOn(plan, "2026-10-18"), null);
check("day 15 is outside", isOn(plan, "2026-11-02"), null);
check("day 14 is the last, off", isOn(plan, "2026-11-01"), false);
check("day N of 14", dayOf(plan, "2026-10-25"), 7);
check("crosses the end of October (no DST slip)", isOn(plan, "2026-10-26"), false);

const day = (d: string, recovery: number | null) => ({ day: d, recovery }) as unknown as Day;
const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10);
  return day(d, i % 2 === 0 ? 70 : 58);
});
const allTicked = new Set(days.filter((_, i) => i % 2 === 0).map((d) => d.day));
const r = experimentResult(plan, days, allTicked, ["Sin alcohol", "El resto"]);
check("seven a side, the gap", [r.groups[0].values.length, r.groups[1].values.length, r.gap], [7, 7, 12]);
check("the verdict", r.verdict, "Te sienta bien");
check("done of due", [r.done, r.due], [7, 7]);

// A day on but not ticked is left out: he did not do it.
const fewTicks = new Set([...allTicked].slice(0, 4));
const early = experimentResult(plan, days, fewTicks, ["Sin alcohol", "El resto"]);
check("four ticked: too early to say", [early.verdict, early.done], [null, 4]);

// A gap under the threshold: nothing changes.
const flat = experimentResult(plan, days.map((d) => day(d.day, 60)), allTicked, ["a", "b"]);
check("flat", flat.verdict, "No cambia nada");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`experiments: ${passed} passed`);
