import assert from "node:assert/strict";

import { clip, parseTones, prompt } from "./tones";

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

const turn = (text: string, startSeconds = 0) => ({ speaker: "SPEAKER_00", text, startSeconds });

test("clip keeps the start and the end", () => {
  const out = clip("a".repeat(50) + "b".repeat(50), 20);
  assert.ok(out.startsWith("aaaaaaaaaa"));
  assert.ok(out.endsWith("bbbbbbbbbb"));
  assert.ok(out.includes("[…]"));
});

test("clip leaves a short one alone", () => assert.equal(clip("hola", 20), "hola"));

test("prompt numbers each conversation and says who with", () => {
  const p = prompt([{ n: 3, with: "client", turns: [turn("¿Para cuándo la demo?")] }]);
  assert.ok(p?.startsWith("## Conversación 3 (con: client)"));
  assert.ok(p?.includes("¿Para cuándo la demo?"));
});

test("prompt skips an empty one and is null with nothing", () => {
  assert.equal(prompt([{ n: 1, with: null, turns: [] }]), null);
});

test("parseTones keeps the asked ones only", () => {
  const out = parseTones(
    {
      conversaciones: [
        { n: 1, tone: "tensa", topic: "Clientes", effect: "Te pudo dejar con prisa." },
        { n: 9, tone: "buena", topic: "Amigos" },
      ],
    },
    [1, 2],
  );
  assert.deepEqual(out, [{ n: 1, tone: "tensa", theme: "Clientes", effect: "Te pudo dejar con prisa." }]);
});

test("parseTones drops a bad tone, an off-list topic is Otros", () => {
  const out = parseTones({ conversaciones: [{ n: 1, tone: "furiosa", topic: "Clientes" }, { n: 2, tone: "buena", topic: "Viajes" }] }, [1, 2]);
  assert.deepEqual(out, [{ n: 2, tone: "buena", theme: "Otros", effect: null }]);
});

test("parseTones takes the first of a repeated number and strips dashes", () => {
  const out = parseTones(
    { conversaciones: [{ n: 1, tone: "mala", topic: "Familia", effect: "Te pudo dejar triste — por la noticia." }, { n: 1, tone: "buena", topic: "Familia" }] },
    [1],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.tone, "mala");
  assert.ok(!out[0]?.effect?.includes("—"));
});

test("parseTones survives garbage", () => assert.deepEqual(parseTones("nada", [1]), []));

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
