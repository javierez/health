/**
 * Which picture each thing gets. The baked aluminium renders in
 * `public/renders` (`pnpm renders`) come first; a kind he invents by talking
 * («he hecho yoga») gets its own icon, drawn once by `~/server/kinds` and
 * served from `/api/icon/<key>`.
 */

/** Areas of the panel → baked render. */
const RENDER: Record<string, string> = {
  sleep: "sleep",
  training: "gym",
  gym: "gym",
  run: "run",
  bike: "bike",
  food: "food",
  medical: "medical",
  work: "work",
};

/** A habit or a new kind says what it is in its name. */
const BY_NAME: [RegExp, string][] = [
  [/pastilla|vitamina|medica|creatina|suplemento/i, "pill"],
  [/le(er|ctura)|libro/i, "book"],
  [/gimnasio|^gym|pesas|fuerza/i, "gym"],
  [/correr|carrera|running/i, "run"],
  [/bici|ciclismo/i, "bike"],
  [/dormir|sueño|siesta/i, "sleep"],
  [/comida|comer|cena|desayuno|almuerzo/i, "food"],
  [/m[eé]dic|consulta|anal[ií]tica/i, "medical"],
  [/trabajo|oficina/i, "work"],
];

/** The baked render a name already has, or null when it needs its own. */
export function bakedFor(name: string): string | null {
  return BY_NAME.find(([re]) => re.test(name))?.[1] ?? null;
}

/** «Natación» → `natacion`. The same name always gives the same key. */
export function kindKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The image of a row: its own kind's icon if it has one, else the area's render. */
/** The renders in public/renders, so a key `ensureKind` returned («pill») is served as is. */
const BAKED = new Set(["sleep", "gym", "run", "bike", "food", "medical", "work", "pill", "book", "habit"]);

export function iconSrc(area: string, title = "", kind?: string | null): string {
  if (kind) {
    const baked = BAKED.has(kind) ? kind : bakedFor(kind);
    if (baked) return `/renders/${baked}.webp`;
    const key = kindKey(kind);
    if (key) return `/api/icon/${key}`;
  }
  if (area === "habit") return `/renders/${bakedFor(title) ?? "habit"}.webp`;
  return `/renders/${RENDER[area] ?? "habit"}.webp`;
}
