/**
 * No test framework here on purpose: this asserts, prints a summary and exits
 * != 0. Run it with `pnpm test`.
 */
import { fixBrandNames } from "./transcript-brand-names";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
  } else {
    failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
  }
}

check("corrects Besta", fixBrandNames("Revisión y formación de Besta"), "Revisión y formación de Vesta");
check("is case-insensitive", fixBrandNames("besta y BESTA"), "Vesta y Vesta");
check("longest key wins", fixBrandNames("el Bestafone"), "el Vesta phone");
check("corrects Inmovilla", fixBrandNames("importar de Inmobilla"), "importar de Inmovilla");

// The regressions this file exists to prevent.
check("leaves emails alone", fixBrandNames("es leon@besthouse.com"), "es leon@besthouse.com");
check("leaves domains alone", fixBrandNames("entra en besthouse.com"), "entra en besthouse.com");
check(
  "needs a word boundary",
  fixBrandNames("dormitorios y kilómetros"),
  "dormitorios y kilómetros",
);
check("does not touch Listos", fixBrandNames("cuando estéis listos"), "cuando estéis listos");

check("passes null through", fixBrandNames(null), null);
check("passes undefined through", fixBrandNames(undefined), undefined);
check("passes empty string through", fixBrandNames(""), "");

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
if (failures.length > 0) process.exitCode = 1;
