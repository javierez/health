import { phoneIn, sectionOf } from "./today-sections";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const row = { urgent: false, done: false, tick: "check" as const };
const source = { short: "X", url: "https://x" };

check("urgent and open: now", sectionOf({ ...row, urgent: true }), "now");
check("urgent but done: back to its block", sectionOf({ ...row, urgent: true, done: true }), "today");
check("urgent bedtime that WHOOP ticks: now", sectionOf({ ...row, urgent: true, tick: null }), "now");
check("advice", sectionOf({ ...row, source }), "advice");
check("the data ticks it: auto", sectionOf({ ...row, tick: null }), "auto");
check("a photo row: today", sectionOf({ ...row, tick: "photo" }), "today");

check("phone with spaces", phoneIn("Cita previa Quirónsalud 900 200 008 o citaprevia@"), "900200008");
check("phone with dots", phoneIn("Llama al 910.687.000"), "910687000");
check("a prescription number is no phone", phoneIn("prescripción 32800466784"), null);
check("no details", phoneIn(null), null);

if (failures.length > 0) {
  console.error(`today-sections: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`today-sections: ${passed} passed`);
