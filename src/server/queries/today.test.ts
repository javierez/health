import { fromItem, trainingRow } from "./today";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const none = { trained: false, meal: false };
const all = { trained: true, meal: true };
const item = (area: string, title: string) => ({ area, title, detail: "" });
const how = (r: { tick: unknown; done?: boolean }) => [r.tick, r.done ?? false];

check("training: on its own, open until WHOOP sees it", how(fromItem(item("training", "Entreno suave de 40 min"), none)), [null, false]);
check("training: done by a workout", how(fromItem(item("training", "Entreno suave de 40 min"), all)), [null, true]);
check("gym counts as training", how(fromItem(item("gym", "Pierna"), all)), [null, true]);
check("rest: only he can say it", how(fromItem(item("training", "Hoy descansa"), all)), ["check", false]);
check("food: no photo needed, he can tick it", how(fromItem(item("food", "Registra las comidas"), none)), ["check", false]);
check("food: done by any meal he told, in words or a photo", how(fromItem(item("food", "Registra las comidas"), all)), ["check", true]);
check("sleep advice: a tick", how(fromItem(item("sleep", "Nada de pantallas desde las 22:00"), all)), ["check", false]);
check("work: a tick", how(fromItem(item("work", "Corta las llamadas a las 20:00"), all)), ["check", false]);
check("the key does not depend on how it is proven", fromItem(item("food", "X"), none).key, fromItem(item("food", "X"), all).key);

check("green recovery: on its own", how(trainingRow(80, true)), [null, true]);
check("yellow recovery, no workout yet", how(trainingRow(50)), [null, false]);
check("red recovery: rest, a tick", how(trainingRow(20, true)), ["check", false]);

if (failures.length > 0) {
  console.error(`today: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`today: ${passed} passed`);
