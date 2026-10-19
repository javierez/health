import { fromLocal, whenText } from "./reminders";
import { range } from "./search";
import { parseMoves, parseProducts } from "./product-tool";
import { idList, parseFile, parseReminders } from "./tools";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

check("summer time, two hours ahead", iso(fromLocal("2026-10-16T18:00")), "2026-10-16T16:00:00.000Z");
check("winter time, one hour ahead", iso(fromLocal("2026-12-01T08:00")), "2026-12-01T07:00:00.000Z");
check("the morning the clocks go back", iso(fromLocal("2026-10-25T09:00")), "2026-10-25T08:00:00.000Z");
check("the morning the clocks go forward", iso(fromLocal("2026-03-29T09:00")), "2026-03-29T07:00:00.000Z");
check("a space instead of T", iso(fromLocal("2026-10-16 18:00")), "2026-10-16T16:00:00.000Z");
check("not a time", fromLocal("mañana a las 8"), null);

const now = new Date("2026-10-16T10:00:00Z");
check("later today", whenText(fromLocal("2026-10-16T18:00")!, now), "hoy a las 18:00");
check("tomorrow", whenText(fromLocal("2026-10-17T08:00")!, now), "mañana a las 08:00");
check("further away keeps the time", whenText(fromLocal("2026-10-20T09:30")!, now).endsWith("a las 09:30"), true);

check("no days: the last two weeks", range({}, "2026-10-16"), { from: "2026-10-03", to: "2026-10-16" });
check("only desde: up to today", range({ desde: "2026-09-01" }, "2026-10-16"), { from: "2026-09-01", to: "2026-10-16" });
check("reversed is put right", range({ desde: "2026-10-10", hasta: "2026-10-01" }, "2026-10-16"), { from: "2026-10-01", to: "2026-10-10" });
check("a bad day is ignored", range({ desde: "ayer", hasta: 5 }, "2026-10-16"), { from: "2026-10-03", to: "2026-10-16" });

check("ids: whole and positive, once", idList([1, "2", "3a", -1, 1.5, 2, 1]), [1, 2]);
check("ids: not a list", idList("4"), []);

const { ok, refused } = parseReminders(
  {
    crear: [
      { cuando: "2026-10-16T18:00", texto: "tomar la pastilla — la de la tarde" },
      { cuando: "2026-10-16T08:00", texto: "pesarse" },
      { cuando: "esta tarde", texto: "llamar" },
      { cuando: "2026-10-17T08:00", texto: "  " },
    ],
  },
  now,
);
check("a future reminder is kept, without dashes", ok.map((r) => [r.at.toISOString(), r.body]), [
  ["2026-10-16T16:00:00.000Z", "tomar la pastilla, la de la tarde"],
]);
check("past, unreadable and empty are refused", refused.length, 3);
check("the past one says so", refused[0]?.endsWith("ya ha pasado"), true);
check("no list, nothing", parseReminders(null, now), { ok: [], refused: [] });

const file = parseFile({
  anadir: [
    { kind: "procedure", title: "Operación de rodilla — menisco", on_day: "2026-11-03", tema: " Rodilla " },
    { kind: "whatever", title: "x" },
    { kind: "note", title: "Ayuno", on_day: "3 de nov" },
    { kind: "note", title: "  " },
  ],
});
check("an off-list kind and an empty title are dropped", file.length, 2);
check("dashes out of the title", file[0]?.title, "Operación de rodilla, menisco");
check("a bad date is dropped, not the entry", file[1]?.onDay, null);
check("the topic, trimmed", file[0]?.topic, "Rodilla");
check("no topic, null", file[1]?.topic, null);
check("nothing to add", parseFile({ archivar: [3] }), []);

const skin = parseProducts({
  guardar: [
    { nombre: "Fusion Water — SPF 50", marca: " ISDIN ", area: "piel", categoria: "solar", spf: "50", momento: "mañana" },
    { nombre: "Sérum", area: "piel", categoria: "maquillaje", spf: 0, activo: "  " },
    { area: "piel", categoria: "retinol" },
    { nombre: "Creatina monohidrato", marca: "MyProtein", area: "suplemento", categoria: "solar", spf: 30, activo: "Creatina 5 g", hoy: true },
  ],
});
check("a cream from the label, dashes out", skin[0], {
  name: "Fusion Water, SPF 50",
  brand: "ISDIN",
  area: "piel",
  category: "solar",
  spf: 50,
  ingredient: null,
  moment: "mañana",
  today: false,
});
check("a supplement keeps no cream kind nor SPF, and counts today", [skin[2]?.area, skin[2]?.category, skin[2]?.spf, skin[2]?.today], [
  "suplemento",
  "otro",
  null,
  true,
]);
check("no area, a cream", parseProducts({ guardar: [{ nombre: "Crema" }] })[0]?.area, "piel");
check("an odd category is «otro», an odd SPF none", [skin[1]?.category, skin[1]?.spf, skin[1]?.ingredient], ["otro", null, null]);
check("no name, not saved", skin.length, 3);

// «El sérum y el contorno por la mañana, la Epitheliale por la noche».
const moves = parseMoves({ rutina: [{ id: 1, momento: "mañana" }, { id: "3", momento: "mañana" }, { id: 2, momento: "noche" }, { id: 4, momento: "ninguna" }, { id: 5, momento: "tarde" }, { momento: "noche" }] });
check("to a routine, or out of one; an odd moment or no id dropped", moves, [
  { id: 1, moment: "mañana" },
  { id: 3, moment: "mañana" },
  { id: 2, moment: "noche" },
  { id: 4, moment: null },
]);
check("nothing to move", parseMoves({ usar: [1] }), []);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
