import { parseCommitments, sameActivities } from "./from-chat";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const changes = (commitments: unknown[]) => parseCommitments({ commitments }).changes;

check(
  "«4 de gimnasio a la semana»",
  changes([{ action: "set", title: "Gimnasio", activities: ["gym"], metric: "sessions", target: 4, period: "week" }]),
  [{ action: "set", id: null, title: "Gimnasio", activities: ["gym"], metric: "sessions", target: 4, period: "week", proof: "auto" }],
);
check(
  "«40 km entre bici y correr»: order fixed, title and period filled in",
  changes([{ action: "set", activities: ["run", "bike", "run"], metric: "km", target: "40" }]),
  [{ action: "set", id: null, title: "Bici o Correr", activities: ["bike", "run"], metric: "km", target: 40, period: "week", proof: "auto" }],
);
check(
  "«la pastilla cada día, te mando foto»: a habit he ticks, never one that asks for a photo",
  changes([{ action: "set", title: "Pastilla", activities: [], metric: "km", target: 1, period: "day", proof: "photo" }]),
  [{ action: "set", id: null, title: "Pastilla", activities: [], metric: "sessions", target: 1, period: "day", proof: "check" }],
);
check(
  "a habit is never auto: nothing would ever count it",
  changes([{ action: "set", title: "Leer", target: 1, period: "day", proof: "auto" }])[0],
  { action: "set", id: null, title: "Leer", activities: [], metric: "sessions", target: 1, period: "day", proof: "check" },
);
check("a habit with no name is nothing", changes([{ action: "set", target: 1, period: "day" }]), []);
check(
  "title with a dash: no dash",
  changes([{ action: "set", title: "Gimnasio — fuerza", activities: ["gym"], target: 3 }])[0],
  { action: "set", id: null, title: "Gimnasio, fuerza", activities: ["gym"], metric: "sessions", target: 3, period: "week", proof: "auto" },
);
check("a set without a target is not a commitment", changes([{ action: "set", activities: ["gym"] }]), []);
check(
  "«2 litros de agua al día»: litres, counted from what he drinks, never ticked",
  changes([{ action: "set", activities: ["water"], metric: "liters", target: 2, proof: "check" }]),
  [{ action: "set", id: null, title: "Agua", activities: ["water"], metric: "liters", target: 2, period: "day", proof: "auto" }],
);
check(
  "litres with no activity is water, and always a day's",
  changes([{ action: "set", id: 4, title: "Hidratación", metric: "liters", target: "2.5", period: "week" }])[0],
  { action: "set", id: 4, title: "Hidratación", activities: ["water"], metric: "liters", target: 2.5, period: "day", proof: "auto" },
);
check("water with a sport is a mistake", changes([{ action: "set", activities: ["water", "gym"], metric: "liters", target: 2 }]), []);
check("20 litres a day is a mistake", changes([{ action: "set", activities: ["water"], metric: "liters", target: 20 }]), []);
check("«quita lo de correr»", changes([{ action: "stop", activities: ["run"] }]), [{ action: "stop", id: null, activities: ["run"] }]);
check("«deja lo de leer»: by its id", changes([{ action: "stop", id: 7 }]), [{ action: "stop", id: 7, activities: [] }]);
check("a stop that names nothing stops nothing", changes([{ action: "stop" }]), []);
check(
  "one bad entry drops that entry only",
  changes([{ action: "sett", activities: ["gym"], target: 2 }, { action: "stop", activities: ["gym"] }]),
  [{ action: "stop", id: null, activities: ["gym"] }],
);
check("«me he tomado la pastilla»: done, ids only, once", parseCommitments({ done: [4, "4", -1, "x", 2.5] }).done, [4]);
check("nothing said: nothing", parseCommitments({ facts: [] }), { changes: [], done: [] });
check("same activities in any order", sameActivities(["run", "bike"], ["bike", "run"]), true);
check("a subset is not the same", sameActivities(["run"], ["bike", "run"]), false);

check(
  "«nunca más tarde de la una»: bedtime from WHOOP, 01:00 as 60",
  parseCommitments({ commitments: [{ action: "set", activities: ["sleep"], metric: "bedtime", target: 60 }] }).changes,
  [{ action: "set", id: null, title: "Dormir", activities: ["sleep"], metric: "bedtime", target: 60, period: "day", proof: "auto" }],
);
check(
  "midnight is a target, a tick is not how it is proven",
  parseCommitments({ commitments: [{ action: "set", activities: ["sleep"], target: 0, proof: "check", period: "week" }] }).changes[0],
  { action: "set", id: null, title: "Dormir", activities: ["sleep"], metric: "bedtime", target: 0, period: "day", proof: "auto" },
);
check("sleep mixed with a sport: dropped", parseCommitments({ commitments: [{ action: "set", activities: ["sleep", "run"], target: 60 }] }).changes, []);
check("25:00 is no clock time", parseCommitments({ commitments: [{ action: "set", activities: ["sleep"], target: 1500 }] }).changes, []);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
