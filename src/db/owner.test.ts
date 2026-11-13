/**
 * 🚨 Every table but the login's says whose row it is (13-nov-2026). A table
 * without `user_id` shows one person's rows to everyone, and a key without it
 * lets one person's row block someone else's (two people, the same day).
 * `scripts/migrate.ts` checks the database on every build; this checks the
 * schema before that.
 */
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schema from "./schema";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean) {
  if (ok) passed += 1;
  else failures.push(name);
}

const tables = Object.values(schema).filter((t): t is PgTable => is(t, PgTable));
const perPerson = tables.map(getTableConfig).filter((t) => !t.name.startsWith("auth_"));
const names = (cols: readonly unknown[]) => cols.map((c) => (c as { name?: string }).name);

check("the schema has its tables", perPerson.length >= 26);
for (const t of perPerson) {
  const owner = t.columns.find((c) => c.name === "user_id");
  check(`${t.name}: has user_id`, Boolean(owner));
  check(`${t.name}: user_id is never empty`, owner?.notNull === true);
  check(
    `${t.name}: user_id points at auth_user`,
    t.foreignKeys.some((fk) => {
      const ref = fk.reference();
      return getTableName(ref.foreignTable) === "auth_user" && names(ref.columns).includes("user_id");
    }),
  );
  for (const pk of t.primaryKeys) check(`${t.name}: its key includes user_id`, names(pk.columns).includes("user_id"));
  for (const u of t.uniqueConstraints) check(`${t.name}: ${u.name ?? "unique"} includes user_id`, names(u.columns).includes("user_id"));
  for (const i of t.indexes.filter((i) => i.config.unique)) {
    check(`${t.name}: ${i.config.name} includes user_id`, names(i.config.columns).includes("user_id"));
  }
  for (const c of t.columns.filter((c) => c.isUnique)) check(`${t.name}.${c.name}: unique on its own, not per person`, false);
}

if (failures.length > 0) {
  console.error(`owner: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`owner: ${passed} passed`);
