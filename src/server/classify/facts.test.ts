import { parseFacts, placeFact, withFoods } from "./facts";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// 13:00 in Madrid on 14-oct-2026 (CEST, UTC+2).
const recordedAt = new Date("2026-10-14T11:00:00Z");

check(
  "no clock: the moment it was said",
  placeFact(recordedAt, { atSeconds: 600, clock: null }).toISOString(),
  "2026-10-14T11:10:00.000Z",
);
check(
  "clock earlier today: that time, same day",
  placeFact(recordedAt, { atSeconds: 0, clock: "08:30" }).toISOString(),
  "2026-10-14T06:30:00.000Z",
);
check(
  "clock later than when it was said: the day before",
  placeFact(recordedAt, { atSeconds: 0, clock: "22:00" }).toISOString(),
  "2026-10-13T20:00:00.000Z",
);

const parsed = parseFacts({
  facts: [
    {
      kind: "meal",
      at_seconds: "120",
      summary: "Comida — lentejas",
      meal: "lunch",
      items: ["lentejas"],
      evidence: "qué buenas las lentejas",
      confidence: 0.9,
    },
    { kind: "dessert", at_seconds: 1, summary: "x", evidence: "x", confidence: 1 },
    { kind: "training", at_seconds: 1, summary: "Entreno acordado", evidence: "x", confidence: 0.4 },
    {
      kind: "training",
      at_seconds: 30,
      summary: "Gimnasio: sentadilla",
      training: "gym",
      exercises: [{ name: "sentadilla", sets: 4, reps: "8", weight_kg: 80 }],
      evidence: "cuatro de ocho",
      confidence: 0.8,
    },
  ],
});

check("an off-list kind or a guess drops that item, not the rest", parsed.length, 2);
check("a string offset is coerced", parsed[0]?.atSeconds, 120);
check("dashes are taken out of the summary", parsed[0]?.summary, "Comida, lentejas");
check("exercises keep their numbers", parsed[1]?.data.exercises, [
  { name: "sentadilla", sets: 4, reps: 8, weightKg: 80 },
]);
check("garbage in, nothing out", parseFacts("nope"), []);

const fresh = parseFacts({
  facts: [
    { kind: "other", summary: "Meditar: 10 min", tipo: " Meditar ", evidence: "he meditado 10 minutos", confidence: 0.9 },
    { kind: "training", summary: "Yoga, 45 min", training: "other", tipo: "", evidence: "yoga", confidence: 0.9 },
  ],
});
check("something new is kept, with what it is", [fresh[0]?.kind, fresh[0]?.tipo], ["other", "Meditar"]);
check("an empty tipo is no tipo", fresh[1]?.tipo, null);

const [meal] = parseFacts({
  facts: [
    {
      kind: "meal",
      summary: "Comida: pollo con arroz y una caña",
      meal: "lunch",
      kcal: 900,
      foods: [
        { name: "Pollo", grams: 180, kcal: 297, protein_g: 56, fat_g: "6.5" },
        { name: "Arroz", grams: 150, kcal: 195, protein_g: 4, carbs_g: 42 },
        { name: "Caña", grams: 200, kcal: 86, alcohol_g: 8 },
        { grams: 50 },
      ],
      evidence: "pollo con arroz y una caña",
      confidence: 0.9,
    },
  ],
});
check("a food without a name drops that food, not the meal", meal?.data.foods?.length, 3);
check("a string number is coerced", meal?.data.foods?.[0]?.fatG, 6.5);
check("the meal's figures are what its foods add up to", [meal?.data.kcal, meal?.data.proteinG], [578, 60]);
check("items come from the foods when not given", meal?.data.items, ["Pollo", "Arroz", "Caña"]);
check("alcohol in a food is alcohol in the meal", meal?.data.alcohol, true);

const [usual] = parseFacts({ facts: [{ kind: "meal", summary: "Desayuno de siempre", meal: "breakfast", like: "412", evidence: "lo de siempre", confidence: 0.9 }] });
check("«lo de siempre» keeps the meal it copies", usual?.like, 412);
const copied = withFoods({ meal: "breakfast" }, [{ name: "Café con leche", kcal: 90, proteinG: 6, caffeineMg: 80 }, { name: "Tostada", kcal: 190, proteinG: 5 }]);
check("a copied meal adds up its foods", [copied.kcal, copied.proteinG, copied.caffeine, copied.items], [280, 11, true, ["Café con leche", "Tostada"]]);

const toilet = parseFacts({
  facts: [
    { kind: "toilet", summary: "Pis: escozor", toilet: "pee", feel: "meh", bristol: 4, symptoms: ["burning", "itch"], evidence: "me escuece", confidence: 0.9 },
    { kind: "toilet", summary: "Caca: tipo 4", toilet: "poo", feel: "great", bristol: "4", evidence: "normal", confidence: 0.9 },
    { kind: "toilet", summary: "Baño", evidence: "he ido al baño", confidence: 0.9 },
  ],
});
check("a toilet time that is neither pee nor poo is dropped", toilet.length, 2);
check("a pee has no stool type, and an unknown symptom is dropped", toilet[0]?.data, { toilet: "pee", feel: "meh", symptoms: ["burning"] });
check("a stool keeps its type; an unknown feel is no feel", toilet[1]?.data, { toilet: "poo", bristol: 4 });

const [own] = parseFacts({
  facts: [
    { kind: "other", summary: "Dolor de cabeza: 6/10", tipo: "Dolor de cabeza", categoria: " síntomas", valor: "6", unidad: "/10", etiquetas: ["sien"], estado: true, evidence: "me duele la cabeza, un 6", confidence: 0.9 },
  ],
});
check("anything of his keeps its name, its category tidied, its value and tags", own?.data, {
  name: "Dolor de cabeza",
  category: "Síntomas",
  value: 6,
  unit: "/10",
  tags: ["sien"],
  state: true,
});

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
