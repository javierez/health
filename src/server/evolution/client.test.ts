import { tokenDead } from "./client";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// What `syncWhatsapp` wrote on 24-oct-2026, when a re-scan in Vesta killed the token.
check("the import's 401", tokenDead(['import: Error: evolution /chat/findMessages 401: {"status":401,"error":"Unauthorized"}']), true);
check("a voice note's 401", tokenDead(["read 2026-10-24: Error: evolution /chat/getBase64FromMediaMessage 401: Unauthorized"]), true);
check("a 500 is a bad day, not a dead token", tokenDead(["import: Error: evolution /chat/findMessages 500: oops"]), false);
check("a 401 inside a body is not its status", tokenDead(["import: Error: evolution /chat/findMessages 500: retry 401: no"]), false);
check("no errors", tokenDead([]), false);

if (failures.length > 0) {
  console.error(`evolution client: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`evolution client: ${passed} passed`);
