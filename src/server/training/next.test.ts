import type { Zone } from "~/lib/exercises";
import { nextTraining } from "./next";
import type { ZoneWeek } from "./summary";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const z = (zone: Zone, fatigue: number, last: string | null): ZoneWeek => ({ zone, sets: 0, fatigue, from: [], last });
const today = "2026-10-18";
const chestDay = [
  z("pecho", 8.4, "2026-10-17"),
  z("triceps", 5.6, "2026-10-17"),
  z("hombros", 2, "2026-10-17"),
  z("espalda", 0, "2026-10-14"),
  z("biceps", 0, "2026-10-14"),
  z("trapecio", 0, null),
  z("cuadriceps", 0, "2026-10-12"),
  z("isquios", 0, "2026-10-12"),
  z("gluteos", 0, null),
];

check("chest yesterday: the group that waited longest", nextTraining(chestDay, today), {
  title: "Hoy toca pierna",
  detail: "Última vez hace 6 días",
});
check(
  "legs loaded too: the back",
  nextTraining(chestDay.map((x) => (x.zone === "cuadriceps" ? { ...x, fatigue: 3, last: "2026-10-16" } : x)), today).title,
  "Hoy toca espalda y bíceps",
);
check("a group never trained goes first", nextTraining([z("pecho", 0, "2026-10-01"), z("cuadriceps", 0, null)], today), {
  title: "Hoy toca pierna",
  detail: "Sin entrenar aún",
});
check("everything loaded: rest", nextTraining(chestDay.map((x) => ({ ...x, fatigue: 6 })), today), { title: "Hoy, descanso", detail: "Camina o haz cardio suave" });
check("after today's session, tomorrow", nextTraining(chestDay, today, "Mañana").title, "Mañana toca pierna");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
