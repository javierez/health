import { byMoment, listOf, phoneIn, sectionOf } from "./today-sections";

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
check(
  "the counter: his list, not the medical alert nor the advice",
  listOf([{ key: "bed" }, { key: "medical-3" }, { key: "advice-sleep", source }, { key: "commitment-1" }]).map((r) => r.key),
  ["bed", "commitment-1"],
);
check("the data ticks it: auto", sectionOf({ ...row, tick: null }), "auto");

check("phone with spaces", phoneIn("Cita previa Quirónsalud 900 200 008 o citaprevia@"), "900200008");
check("phone with dots", phoneIn("Llama al 910.687.000"), "910687000");
check("a prescription number is no phone", phoneIn("prescripción 32800466784"), null);
check("no details", phoneIn(null), null);

const day = [
  { key: "bed", title: "A la cama a las 00:30", urgent: false, tick: null },
  { key: "c1", title: "Rutina de noche", urgent: false, tick: "check" as const },
  { key: "c2", title: "Pastilla", urgent: false, tick: "check" as const },
  { key: "c3", title: "Correr o bici: 0 km de 40 km", urgent: false, tick: null },
  { key: "c4", title: "En ayunas", urgent: false, tick: "check" as const },
  { key: "c5", title: "Rutina de mañana", urgent: false, tick: "check" as const },
  { key: "c6", title: "Antes de entrenar", urgent: false, tick: "check" as const },
];
const order = (now: number | null) => byMoment(day, now, 30).map((r) => r.title);
check("8:15: the morning first, then any time, then the evening by its hour", order(8 * 60 + 15), [
  "En ayunas",
  "Rutina de mañana",
  "Pastilla",
  "Antes de entrenar",
  "Correr o bici: 0 km de 40 km",
  "Rutina de noche",
  "A la cama a las 00:30",
]);
check("22:30: the night now, bed by its hour, the morning let pass at the end", order(22 * 60 + 30), [
  "Rutina de noche",
  "Pastilla",
  "Antes de entrenar",
  "Correr o bici: 0 km de 40 km",
  "A la cama a las 00:30",
  "En ayunas",
  "Rutina de mañana",
]);
check("past midnight is still tonight", order(15)[0], "Rutina de noche");
check("urgent first, whatever the hour", byMoment([...day, { key: "c7", title: "Gimnasio", urgent: true, tick: "check" as const }], 8 * 60, 30)[0]!.title, "Gimnasio");
check("a past day: his ticks before the data's, in the server's order", order(null), [
  "Rutina de noche",
  "Pastilla",
  "En ayunas",
  "Rutina de mañana",
  "Antes de entrenar",
  "A la cama a las 00:30",
  "Correr o bici: 0 km de 40 km",
]);

if (failures.length > 0) {
  console.error(`today-sections: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`today-sections: ${passed} passed`);
