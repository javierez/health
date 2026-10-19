import { dayLine, detail, type ToiletTime } from "./toilet";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const pee = (minutes: number, more: Partial<ToiletTime> = {}): ToiletTime => ({ toilet: "pee", minutes, ...more });
const poo = (minutes: number, more: Partial<ToiletTime> = {}): ToiletTime => ({ toilet: "poo", minutes, ...more });

check("a plain one says how it went", detail(pee(600, { feel: "good" })), "bien");
check("a symptom says itself, not «bien» on top", detail(pee(600, { feel: "good", symptoms: ["burning"] })), "escozor");
check("a stool says its type first", detail(poo(500, { bristol: 4, feel: "meh" })), "tipo 4, regular");
check("nothing told, nothing said", detail(pee(600)), "");

check(
  "a day: pees with the night ones, stools with their type, symptoms counted",
  dayLine([pee(150), pee(480, { symptoms: ["burning"] }), pee(900, { symptoms: ["burning", "urgency"] }), poo(540, { bristol: 4 })]),
  "3 pis (1 de noche) · 1 caca (tipo 4) · escozor 2 veces · urgencia 1 vez",
);
check("a day with only a stool", dayLine([poo(540)]), "1 caca");

check("how long, when he says it", detail(poo(540, { bristol: 4, durationMin: 10, feel: "good" })), "tipo 4, 10 min");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
