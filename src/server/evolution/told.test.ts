import { toldRows, transcript, type ChatLine } from "./told";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// 14-nov-2026 in Madrid is UTC+1: 13:02Z is 14:02 there.
const line = (id: string, fromMe: boolean, utc: string, extra: Partial<ChatLine> = {}): ChatLine => ({
  id,
  fromMe,
  at: new Date(utc),
  day: "2026-11-14",
  type: "conversation",
  body: null,
  seconds: null,
  seen: null,
  ...extra,
});

const lines = [
  line("A1", false, "2026-11-14T13:00:00Z", { body: "¿Qué has comido?" }),
  line("J1", true, "2026-11-14T13:02:00Z", { type: "imageMessage", body: "Mira", seen: "Un plato de lentejas, unos 300 g, y pan" }),
  line("J2", true, "2026-11-14T13:05:00Z", { body: "He desayunado a las 8:30 un café con tostada y luego he corrido 5 km" }),
  line("A2", false, "2026-11-14T13:06:00Z", { body: "Yo una ensalada" }),
];

check(
  "the chat as the model reads it",
  transcript(lines.slice(0, 2), "Amaya"),
  "[1] 2026-11-14 14:00 Amaya: ¿Qué has comido?\n[2] 2026-11-14 14:02 Javier: [foto: Un plato de lentejas, unos 300 g, y pan] Mira",
);

const fact = (mensaje: number, extra: Record<string, unknown> = {}) => ({
  kind: "meal",
  mensaje,
  meal: "lunch",
  summary: "Comida: lentejas y pan",
  evidence: "Un plato de lentejas",
  confidence: 0.8,
  ...extra,
});

const lunch = toldRows(
  {
    facts: [
      fact(2, {
        foods: [
          { name: "Lentejas", grams: 300, kcal: 350, protein_g: 22 },
          { name: "Pan", grams: 40, kcal: 100, protein_g: 3 },
        ],
      }),
    ],
  },
  lines,
).map((t) => t.row);
check("a meal at the photo he sent", lunch.map((r) => [r.waMessageId, r.at.toISOString(), r.day]), [["J1", "2026-11-14T13:02:00.000Z", "2026-11-14"]]);
check("its foods add up", [lunch[0]?.data.kcal, lunch[0]?.data.proteinG, lunch[0]?.data.items], [450, 25, ["Lentejas", "Pan"]]);
check("kept apart from the Pocket's and the chat's", lunch[0]?.promptVersion, "wa-facts-v1");

check(
  "the hour he says, not the message's",
  toldRows({ facts: [fact(3, { meal: "breakfast", clock: "08:30" })] }, lines).map((t) => t.row.at.toISOString()),
  ["2026-11-14T07:30:00.000Z"],
);
check(
  "a run counts as a training",
  toldRows({ facts: [fact(3, { kind: "training", training: "run", distance_km: 5, summary: "Correr: 5 km" })] }, lines).map((t) => [t.row.kind, t.row.data.distanceKm]),
  [["training", 5]],
);
check(
  "a headache, with its kind to draw",
  toldRows({ facts: [fact(2, { kind: "other", tipo: "Dolor de cabeza", categoria: "Síntomas", estado: true, summary: "Dolor de cabeza" })] }, lines).map((t) => [t.row.kind, t.fact.tipo]),
  [["other", "Dolor de cabeza"]],
);
check(
  "his mood is not a chat's",
  toldRows({ facts: [fact(2, { kind: "other", tipo: "Ánimo", categoria: "Ánimo", valor: 4, unidad: "/10", estado: true })] }, lines),
  [],
);
check("what she ate is nothing of his", toldRows({ facts: [fact(4)] }, lines), []);
check("a line that is not there", toldRows({ facts: [fact(9)] }, lines), []);
check("a guess is left out", toldRows({ facts: [fact(2, { confidence: 0.4 })] }, lines), []);
check("no answer, nothing", toldRows(null, lines), []);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
