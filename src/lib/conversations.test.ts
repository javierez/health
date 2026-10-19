import assert from "node:assert/strict";

import { MIN_PERSON, summarizeTalks, weekOf, type Talk } from "./conversations";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`✗ ${name}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

const TODAY = "2026-10-18"; // a Sunday
const wa = (day: string, who: string, tone: Talk["tone"], topic: Talk["topic"] = "Clientes"): Talk => ({ day, source: "whatsapp", who, tone, topic });
const pocket = (day: string, tone: Talk["tone"], topic: Talk["topic"] = "Socio"): Talk => ({ day, source: "pocket", who: "Socio", tone, topic });

test("weekOf is the Monday", () => {
  assert.equal(weekOf("2026-10-18"), "2026-10-12");
  assert.equal(weekOf("2026-10-12"), "2026-10-12");
});

test("eight weeks back, both sources counted", () => {
  const out = summarizeTalks([wa("2026-10-17", "Pedro", "tensa"), pocket("2026-10-13", "buena"), wa("2026-01-01", "Old", "mala")], TODAY);
  assert.equal(out.total, 2);
});

test("topics by how often, with their tense ones", () => {
  const out = summarizeTalks([wa("2026-10-17", "A", "tensa"), wa("2026-10-16", "B", "neutra"), pocket("2026-10-15", "mala", "Socio")], TODAY);
  assert.deepEqual(out.topics, [
    { topic: "Clientes", talks: 2, tense: 1 },
    { topic: "Socio", talks: 1, tense: 1 },
  ]);
});

test(`people: WhatsApp only, ${MIN_PERSON} or more, the tensest first`, () => {
  const talks = [
    ...["2026-10-10", "2026-10-11", "2026-10-12"].map((d) => wa(d, "Pedro", "tensa")),
    ...["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"].map((d, i) => wa(d, "Ana", i === 0 ? "tensa" : "buena")),
    wa("2026-10-14", "Luis", "mala"),
    ...["2026-10-10", "2026-10-11", "2026-10-12"].map((d) => wa(d, "23949492670633", "tensa")),
    ...["2026-10-10", "2026-10-11", "2026-10-12"].map((d) => pocket(d, "tensa")),
  ];
  const out = summarizeTalks(talks, TODAY);
  assert.deepEqual(
    out.people.map((p) => [p.who, p.tense, p.talks]),
    [
      ["Pedro", 3, 3],
      ["Ana", 1, 4],
    ],
  );
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
