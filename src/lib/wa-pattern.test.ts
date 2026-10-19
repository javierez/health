import type { WaTone, WaTopic } from "~/db/schema";
import { bandOf, moodPattern, topicTension, type Morning } from "./wa-pattern";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("1 and 2 are tense, 3 normal, 4 and 5 good", [1, 2, 3, 4, 5].map(bandOf), ["tenso", "tenso", "normal", "bueno", "bueno"]);

const morning = (recovery: number | null, hrv: number | null = 50): Morning => ({ recovery, hrv });
// A tense day on the 1st shows on the 2nd's recovery, not the 1st's.
const mornings = new Map<string, Morning>([
  ["2026-09-01", morning(90)],
  ["2026-09-02", morning(40, 45)],
  ["2026-09-03", morning(44, 47)],
  ["2026-09-04", morning(42, 46)],
  ["2026-09-05", morning(70, 60)],
  ["2026-09-06", morning(66, 58)],
  ["2026-09-07", morning(68, null)],
  ["2026-09-08", morning(null)],
]);
const days = [
  { day: "2026-09-01", mood: 2 },
  { day: "2026-09-02", mood: 1 },
  { day: "2026-09-03", mood: 2 },
  { day: "2026-09-04", mood: 4 },
  { day: "2026-09-05", mood: 3 },
  { day: "2026-09-06", mood: 5 },
  { day: "2026-09-07", mood: 4 },
];
const p = moodPattern(days, mornings);
check("the morning after, and a morning WHOOP did not score is out", p.paired, 6);
check("tense days average their next mornings", p.rows[0], { band: "tenso", days: 3, recovery: 42, hrv: 46 });
check("an HRV it lacks is not a zero", p.rows[2], { band: "bueno", days: 2, recovery: 69, hrv: 60 });
check("the gap is the rest against the tense", p.gap, 26);
check("it says what it costs", p.headline, "Tras un día tenso en WhatsApp amaneces con 26 puntos menos de recuperación.");

const few = moodPattern(days.slice(0, 2), mornings);
check("two tense days are not a pattern", [few.gap, few.headline.startsWith("Aún pocos días")], [null, true]);

const flat = moodPattern(
  days,
  new Map([...mornings].map(([d, m]) => [d, { ...m, recovery: m.recovery === null ? null : 60 + (d.endsWith("3") ? 2 : 0) }])),
);
check("a small gap is no pattern", flat.headline, "Por ahora tus días tensos no se notan en la recuperación de la mañana siguiente.");

const many = (n: number, topic: WaTopic | null, tone: WaTone = "neutra") => Array.from({ length: n }, () => ({ topic, tone }));
const topics = topicTension([
  { chats: [...many(3, "Clientes", "tensa"), ...many(1, "Clientes", "mala"), ...many(4, "Clientes")] },
  { chats: [...many(1, "Familia", "tensa"), ...many(9, "Familia")] },
  { chats: [...many(4, "Dinero", "tensa"), ...many(9, "Otros", "tensa"), ...many(9, null, "tensa")] },
]);
check("tense or bad, in % of each topic's chats, most tense first", topics, [
  { topic: "Clientes", chats: 8, tense: 50 },
  { topic: "Familia", chats: 10, tense: 10 },
]);
check("too few chats, «Otros» and no topic stay out", topics.map((t) => t.topic).includes("Dinero"), false);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
