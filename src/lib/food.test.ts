import { amount, complete, proteinTarget, usual } from "./food";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const cafe = { name: "Café con leche", kcal: 90 };
const tostada = { name: "Tostada con tomate", kcal: 190 };
// Newest first, as the context reads them.
const meals = [
  { id: 30, meal: "breakfast", foods: [tostada, { ...cafe, name: "café con leche " }] },
  { id: 29, meal: "lunch", foods: [{ name: "Lentejas" }] },
  { id: 20, meal: "breakfast", foods: [cafe, tostada] },
  { id: 12, meal: "snack", foods: [cafe, tostada] },
  { id: 11, meal: "breakfast", foods: [cafe, tostada] },
  { id: 5, meal: "dinner" },
];
check("the same foods at the same meal, in any order and case, are one habit; the newest id", usual(meals), [{ id: 30, times: 3 }]);
check("once is not a habit", usual(meals.slice(0, 2)), []);
check("the same foods at another meal are another habit", usual([...meals, { id: 1, meal: "snack", foods: [cafe, tostada] }]), [
  { id: 30, times: 3 },
  { id: 12, times: 2 },
]);

check("protein: 1,6 g per kg, to the nearest 5", [proteinTarget(75), proteinTarget(78.4)], [120, 125]);
check("amounts: grouped thousands, a tenth under 10", [amount(1022), amount(0.3), amount(12.6)], ["1.022", "0,3", "13"]);
check("a day counts with lunch and dinner told food by food", [
  complete([{ meal: "lunch", foods: [cafe] }, { meal: "dinner", foods: [tostada] }]),
  complete([{ meal: "lunch", foods: [cafe] }, { meal: "dinner" }]),
], [true, false]);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
