import type { Session } from "~/server/training/summary";
import { hours, monthsOf, nextOf, subOf, thisWeek, titleOf, weekday } from "./sessions";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const ex = (name: string) => ({ name, text: "1 serie", sets: [], detail: [], move: null });
const sport = (name: string, text: string) => ({ name, text, sets: [], detail: [], sport: true as const, move: null });
const session = (day: string, over: Partial<Session> = {}): Session => ({ day, lines: [], said: [], minutes: null, routineId: null, span: null, ...over });

check("minutes", hours(41), "41 min");
check("hours and minutes", hours(73), "1 h 13 min");
check("whole hours", hours(120), "2 h");
check("weekday", [weekday("2026-10-21"), weekday("2026-10-18")], ["mié", "dom"]);

const leg = session("2026-10-21", { lines: ["Oso a pica", "Zancada estática"].map(ex), routineId: 2, routine: { name: "Rutina de pierna", done: 7, of: 7 } });
const months = monthsOf(
  [
    leg,
    session("2026-10-18", { lines: [sport("Andar", "15 min")], minutes: 15 }),
    session("2026-10-14", { lines: [sport("Pesas", "43 min")], minutes: 43 }),
    session("2026-10-12", { lines: [sport("Pesas", "44 min")], minutes: 44 }),
    session("2026-09-30", { said: ["Gimnasio: pierna"] }),
    session("2025-12-30", { lines: [sport("Pesas", "30 min")], minutes: 30 }),
  ],
  "2026-10-22",
);
check("by month, the year only when it is another", months.map((m) => [m.label, m.meta, m.sessions.length]), [
  ["Octubre", "4 días", 4],
  ["Septiembre", "1 día", 1],
  ["Diciembre 2025", "1 día · 30 min", 1],
]);

const timed = monthsOf([session("2026-10-18", { lines: [sport("Andar", "50 min")], minutes: 50 }), session("2026-10-15", { lines: [sport("Pesas", "44 min")], minutes: 44 })], "2026-10-22");
check("the month's time when every session has one", timed[0]!.meta, "2 días · 1 h 34 min");
check("this week, Monday to today", thisWeek([session("2026-10-22"), session("2026-10-21"), session("2026-10-18")], "2026-10-22"), 2);

check("a routine by its name", [titleOf(leg), subOf(leg)], ["Rutina de pierna", "Completa"]);
const part = { ...leg, routine: { name: "Rutina de pierna", done: 4, of: 7 }, minutes: 41 };
check("part of a routine, with WHOOP's time", subOf(part), "4 de 7 ejercicios · 41 min");
const free = session("2026-10-16", { lines: [ex("Press banca"), ex("Dominadas"), sport("Correr", "6 km")] });
check("exercises and a run", [titleOf(free), subOf(free)], ["Gimnasio", "2 ejercicios · Correr 6 km"]);
const run = session("2026-10-17", { lines: [sport("Correr", "6 km · 30 min")], minutes: 30 });
check("a run alone", [titleOf(run), subOf(run)], ["Correr", "6 km · 30 min"]);
const whoop = session("2026-10-14", { lines: [sport("Pesas", "43 min")], minutes: 43 });
check("WHOOP's weights alone", [titleOf(whoop), subOf(whoop)], ["Pesas", "43 min"]);
const said = session("2026-10-15", { said: ["Gimnasio: pierna"] });
check("only what he said", [titleOf(said), subOf(said)], ["Gimnasio: pierna", ""]);

const routine = ["Sentadilla isométrica en pared", "Zancada estática", "Oso a pica"];
check("next: the first not done, accents aside", nextOf(routine, session("2026-10-22", { lines: [ex("sentadilla isometrica en pared")] })), "Zancada estática");
check("next: none when all done", nextOf(routine, session("2026-10-22", { lines: routine.map(ex) })), null);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`sessions: ${passed} passed`);
