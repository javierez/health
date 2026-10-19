import { movesIn, parseMove } from "./learn";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const swing = {
  como: "De pie, balanceas la pesa rusa entre las piernas y la llevas a la altura del pecho con la cadera.",
  musculos: [
    { musculo: "gluteos", papel: "principal" },
    { musculo: "isquios", papel: "principal" },
    { musculo: "lumbares", papel: "ayuda" },
    { musculo: "abdomen", papel: "sujeta" },
    { musculo: "gluteos", papel: "sujeta" },
    { musculo: "cuello", papel: "ayuda" },
  ],
  inicio: "Hips hinged back, kettlebell between the legs.",
  final: "Standing tall, kettlebell at chest height, arms straight.",
  fuentes: [{ titulo: "ExRx — Kettlebell Swing", url: "https://exrx.net/swing" }, { titulo: "sin url", url: "no" }],
};
const m = parseMove(swing, false);
check("roles become sets", m?.work, { gluteos: 1, isquios: 1, lumbares: 0.5, abdomen: 0.25 });
check("the poses ride along", [m?.start, m?.end], [swing.inicio, swing.final]);
check("no long dashes, bad source dropped", m?.sources, [{ title: "ExRx, Kettlebell Swing", url: "https://exrx.net/swing" }]);
const wordy = parseMove({ ...swing, como: "palabra ".repeat(60) }, false);
check("a wordy line is cut, the move kept", [wordy?.how.length !== undefined && wordy.how.length <= 160, wordy?.how.endsWith("…")], [true, true]);
check("no muscles, nothing", parseMove({ ...swing, musculos: [] }, false), null);
check("no pose, nothing", parseMove({ ...swing, final: "" }, false), null);

const yoga = parseMove({ ...swing, musculos: [{ musculo: "abdomen", papel: "principal" }, { musculo: "hombros", papel: "ayuda" }], intensidad: "suave" }, true);
check("a soft sport: half per 30 min", yoga?.work, { abdomen: 0.5, hombros: 0.25 });
const boxing = parseMove({ ...swing, musculos: [{ musculo: "hombros", papel: "principal" }] }, true);
check("intensity not said: medium", boxing?.work, { hombros: 0.75 });

const gym = (exercises: { name: string; sets?: number }[], summary = "Gimnasio") => ({ kind: "training", summary, data: { training: "gym", exercises } });
check("each exercise by sets", movesIn(gym([{ name: "Kettlebell swing", sets: 3 }, { name: "Press banca" }])), [
  { name: "Kettlebell swing", byTime: false },
  { name: "Press banca", byTime: false },
]);
check("a run", movesIn({ kind: "training", summary: "Correr 6 km", data: { training: "run", distanceKm: 6 } }), [{ name: "Correr", byTime: true }]);
check("a walk by its words", movesIn({ kind: "training", summary: "Andar 50 min", data: { training: "other" } }), [{ name: "Andar", byTime: true }]);
check("something new, by time", movesIn({ kind: "training", summary: "Yoga 60 min", data: { training: "other" }, tipo: "Yoga" }), [{ name: "Yoga", byTime: true }]);
check("a leg day says where, not what", movesIn({ kind: "training", summary: "Gimnasio: pierna", data: { training: "gym" }, tipo: "Gimnasio" }), []);
check("a meal is not a move", movesIn({ kind: "meal", summary: "Comida", data: {} }), []);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`learn: ${passed} passed`);
