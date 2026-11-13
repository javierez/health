import type { Standing } from "~/server/commitments/standing";
import { afterTraining } from "./after-training";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const NOW = new Date("2026-10-22T18:00:00+02:00");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const routine = (over: Partial<Standing> = {}) =>
  ({
    status: "pending",
    doneToday: false,
    members: [
      { id: 1, name: "Creatina monohidrato", kind: null },
      { id: 2, name: "Magnesio", kind: null },
    ],
    ...over,
  }) as Standing;
const ask = (over: Partial<Parameters<typeof afterTraining>[0]> = {}) => afterTraining({ routine: routine(), last: ago(45), asked: false, now: NOW, ...over });

check("trained 45 min ago: asked, with what goes in it", ask(), "¿Te tomaste lo de antes de entrenar (Creatina monohidrato y Magnesio)?");
check("still training (last set 10 min ago): not yet", ask({ last: ago(10) }), null);
check("no training today: nothing", ask({ last: null }), null);
check("a rest day: not owed", ask({ routine: routine({ status: "on-pace" }) }), null);
check("already ticked: nothing", ask({ routine: routine({ doneToday: true }) }), null);
check("asked once today: not again", ask({ asked: true }), null);
check("no routine: nothing", ask({ routine: undefined }), null);
check("one thing in it", ask({ routine: routine({ members: [{ id: 1, name: "Creatina", kind: null }] }) }), "¿Te tomaste lo de antes de entrenar (Creatina)?");

if (failures.length > 0) {
  console.error(`after-training: ${failures.length} failed, ${passed} passed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`after-training: ${passed} passed`);
