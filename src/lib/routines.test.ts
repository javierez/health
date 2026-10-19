import { isRoutine, routineTitle, sameProduct } from "./routines";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("morning", routineTitle("mañana"), "Rutina de mañana");
check("night", routineTitle("noche"), "Rutina de noche");
check("before training", routineTitle("entreno"), "Antes de entrenar");
check("no moment, no routine", routineTitle(null), null);
check("a moment that is not a routine", routineTitle("tarde"), null);
check("a routine by its title", [isRoutine("Rutina de noche"), isRoutine("Pastilla")], [true, false]);

// His three habits from before routines, against the products they were for (19-oct-2026).
check("a habit with the short name", sameProduct("Hyalu B5 Serum", "Hyalu B5 Serum Suractiv"), true);
check("the same name", sameProduct("Epitheliale Ultra Repair", "Epitheliale Ultra Repair"), true);
check("case and accents apart", sameProduct("eye care cream", "Eye Care Cream"), true);
check("another product", sameProduct("Eye Care Cream", "Hyalu B5 Serum Suractiv"), false);
check("a short word never matches", sameProduct("Té", "Té verde matcha"), false);
check("a routine is not a product's habit", sameProduct("Pastilla", "Omega 3"), false);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
