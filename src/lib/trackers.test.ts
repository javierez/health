import { byCategory, moodDays, moodOf, placeOf, symptomsOf, tidy, valueText, type Logged } from "./trackers";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("a value out of ten", valueText(6, "/10"), "6/10");
check("a value with its unit", valueText(2, "L"), "2 L");
check("a count alone", valueText(3), "3");
check("nothing said, nothing shown", valueText(undefined, "min"), "");

check("one capital, single spaces", tidy("  síntomas   raros "), "Síntomas raros");

check("his own thing goes where he put it", placeOf("other", { name: "Dolor de cabeza", category: "Síntomas" }, "Dolor de cabeza: 6/10"), {
  category: "Síntomas",
  name: "Dolor de cabeza",
});
check("an old one without a name takes the summary's head", placeOf("other", {}, "Meditar: 10 min"), { category: "Otros", name: "Meditar" });
check("a fixed kind has its fixed place", placeOf("toilet", { toilet: "poo" }, "Caca: tipo 4"), { category: "Baño", name: "Caca" });
check("a yoga keeps its name under Entreno", placeOf("training", { training: "other", name: "Yoga" }, "Yoga, 45 min"), { category: "Entreno", name: "Yoga" });

check("his mood out of ten", moodOf({ name: "Ánimo", value: 7, unit: "/10", state: true }), 7);
check("out of five, doubled", moodOf({ name: "Estado de animo", value: 4, unit: "/5" }), 8);
check("filed under Ánimo, no scale said", moodOf({ name: "Cómo estoy", category: "ánimo", value: 6 }), 6);
check("no figure, no mood", moodOf({ name: "Ánimo" }), null);
check("a headache is no mood", moodOf({ name: "Dolor de cabeza", value: 6, unit: "/10" }), null);

const week = moodDays(
  [{ day: "2026-10-18", value: 7 }, { day: "2026-10-18", value: 4 }, { day: "2026-10-01", value: 9 }],
  [{ day: "2026-10-18", mood: 3 }, { day: "2026-10-17", mood: null }],
  "2026-10-19",
  3,
);
check("three days, oldest first, today last", week.map((d) => d.day), ["2026-10-17", "2026-10-18", "2026-10-19"]);
check("two told the same day, in order; chats as out of 10", week[1], { day: "2026-10-18", said: [7, 4], chats: 6 });
check("a day with nothing", week[2], { day: "2026-10-19", said: [], chats: null });

check("a symptom he filed", symptomsOf("other", { name: "Dolor de cabeza", category: "Síntomas" }, "Dolor de cabeza: 6/10"), ["Dolor de cabeza"]);
check("a pee that burned", symptomsOf("toilet", { toilet: "pee", symptoms: ["burning", "urgency"] }, "Pis: escozor"), ["Pis con escozor", "Pis con urgencia"]);
check("a fine pee is no symptom", symptomsOf("toilet", { toilet: "pee", feel: "good" }, "Pis: bien"), []);
check("water is no symptom", symptomsOf("other", { name: "Agua", category: "Hidratación" }, "Agua: 2 L"), []);

const rows: Logged[] = [
  { kind: "other", day: "2026-10-18", summary: "Dolor de cabeza: 6/10", data: { name: "Dolor de cabeza", category: "Síntomas", value: 6, unit: "/10" } },
  { kind: "toilet", day: "2026-10-18", summary: "Pis: bien", data: { toilet: "pee" } },
  { kind: "toilet", day: "2026-10-18", summary: "Pis: bien", data: { toilet: "pee" } },
  { kind: "other", day: "2026-10-17", summary: "Dolor de cabeza: 4/10", data: { name: "dolor de cabeza", category: "síntomas", value: 4, unit: "/10" } },
  { kind: "toilet", day: "2026-10-17", summary: "Caca: tipo 4", data: { toilet: "poo" } },
  { kind: "toilet", day: "2026-10-17", summary: "Pis: bien", data: { toilet: "pee" } },
];
const cats = byCategory(rows);
check("most used category first", cats.map((c) => [c.category, c.times, c.own]), [
  ["Baño", 4, false],
  ["Síntomas", 2, true],
]);
check("one type whatever its case, with the newest value", cats[1]?.types, [{ name: "Dolor de cabeza", times: 2, last: "2026-10-18", lastValue: "6/10" }]);
check("most used type first", cats[0]?.types.map((t) => [t.name, t.times]), [
  ["Pis", 3],
  ["Caca", 1],
]);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
