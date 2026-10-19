import assert from "node:assert/strict";

import { bakedFor, iconSrc, kindKey } from "./renders";

let passed = 0;
const it = (name: string, fn: () => void) => {
  fn();
  passed++;
};

it("keys drop accents, case and spaces", () => {
  assert.equal(kindKey("Natación"), "natacion");
  assert.equal(kindKey("  Yoga en casa! "), "yoga-en-casa");
  assert.equal(kindKey("Pádel"), "padel");
});

it("a name the baked renders already cover never asks for a new icon", () => {
  assert.equal(bakedFor("Gimnasio"), "gym");
  assert.equal(bakedFor("la vitamina D"), "pill");
  assert.equal(bakedFor("Leer 20 min"), "book");
  assert.equal(bakedFor("yoga"), null);
  assert.equal(iconSrc("habit", "", "Correr por el parque"), "/renders/run.webp");
});

it("a new kind goes to its own icon", () => {
  assert.equal(iconSrc("habit", "Yoga 20 min", "Yoga"), "/api/icon/yoga");
  assert.equal(iconSrc("training", "", "Natación"), "/api/icon/natacion");
});

it("a key ensureKind returned for a baked synonym is served as that render", () => {
  assert.equal(iconSrc("other", "", "pill"), "/renders/pill.webp");
  assert.equal(iconSrc("other", "", "book"), "/renders/book.webp");
  assert.equal(iconSrc("other", "", "sleep"), "/renders/sleep.webp");
});

it("without a kind, nothing changes", () => {
  assert.equal(iconSrc("sleep"), "/renders/sleep.webp");
  assert.equal(iconSrc("training"), "/renders/gym.webp");
  assert.equal(iconSrc("habit", "Pastilla"), "/renders/pill.webp");
  assert.equal(iconSrc("habit", "Algo raro"), "/renders/habit.webp");
  assert.equal(iconSrc("whatsapp"), "/renders/habit.webp");
});

console.log(`renders: ${passed} passed`);
