import { itemKey } from "~/server/queries/today";
import { pickReminders, reminderCap, type Aviso } from "./day-reminders";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const at = (h: number, m = 0) => h * 60 + m;
const NOTE = at(9, 30);
const BED = at(1, 30);
const TITLES = ["Entreno suave, 40 min de zona 2", "Lleva el escáner a la cita"];
const pick = (avisos: Aviso[], { now = NOTE, bed = BED, max = 4 } = {}) => pickReminders(avisos, TITLES, now, bed, max);
const times = (avisos: Aviso[], opts?: Parameters<typeof pick>[1]) => pick(avisos, opts).map((p) => p.minutes);

check(
  "tied to its row by the item's title",
  pick([{ hora: "18:00", texto: "Hueco hasta las 19:15: zona 2, 40 min.", de: "entreno suave, 40 min de zona 2 " }]),
  [{ key: itemKey(TITLES[0]!), minutes: at(18), body: "Hueco hasta las 19:15: zona 2, 40 min." }],
);
check("about no row: no key", pick([{ hora: "12:00", texto: "Medio litro de agua." }]).map((p) => p.key), [null]);
check("an unknown title is no row", pick([{ hora: "12:00", texto: "Agua.", de: "Bebe agua" }]).map((p) => p.key), [null]);
check("no text: the item's title", pick([{ hora: "15:45", de: TITLES[1] }]).map((p) => p.body), [TITLES[1]]);
check(
  "«Antes de entrenar» has no hour: asked after training",
  pickReminders([{ hora: "18:00", texto: "La creatina antes de entrenar.", de: "Antes de entrenar" }], [...TITLES, "Antes de entrenar"], NOTE, BED, 4),
  [],
);
check("no text and no row: nothing", times([{ hora: "15:45" }]), []);
check("not a time", times([{ hora: "a la cena", texto: "Cena" }, { hora: "25:00", texto: "Pesa" }]), []);
check("an early hour is fine", times([{ hora: "9:50", texto: "Pesa" }]), [at(9, 50)]);
check("not right after the note", times([{ hora: "09:40", texto: "Desayuna" }]), []);
check("not after 22:30 with a late bedtime", times([{ hora: "22:45", texto: "Cena" }]), []);
check("an hour before an early bedtime", times([{ hora: "22:15", texto: "Cena" }], { bed: at(23) }), []);
check(
  "in time order, an hour apart",
  times([
    { hora: "18:30", texto: "c" },
    { hora: "12:00", texto: "a" },
    { hora: "12:30", texto: "b" },
  ]),
  [at(12), at(18, 30)],
);
const hourly = ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"].map((hora) => ({ hora, texto: hora }));
check("as many as the cap", [times(hourly, { max: 2 }).length, times(hourly).length, times(hourly, { max: 8 }).length], [2, 4, 8]);
check(
  "one line, no dashes",
  pick([{ hora: "21:00", texto: "Cena con  proteína — salmón\no pollo." }]).map((p) => p.body),
  ["Cena con proteína, salmón o pollo."],
);

// reminderCap: the last week's, answered or not.
const sent = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 13 + i, 10)));
const after = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
const answer = (s: Date[], n: number, minutes = 30) => s.slice(0, n).map((d) => after(d, minutes));
const six = sent(6);
check("too few to tell: four", reminderCap(sent(3), []), 4);
check("answers almost all: eight", reminderCap(six, answer(six, 5)), 8);
check("answers half: six", reminderCap(six, answer(six, 3)), 6);
check("answers a few: four", reminderCap(six, answer(six, 2)), 4);
check("lets them go: two", reminderCap(six, answer(six, 1)), 2);
check("three hours later is not an answer", reminderCap(six, answer(six, 6, 180)), 2);
check("before it is not an answer", reminderCap(six, answer(six, 6, -30)), 2);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
