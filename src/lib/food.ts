/**
 * What he eats, food by food: grams and nutrients, estimated by the agent
 * from a photo or his words, or read off a label. Javier, 18-oct-2026: «una
 * zona de alimentación en la que mediremos todos los macros… toda la comida,
 * todos los suplementos». Pure: the agent, «Cómo te afecta» and the panel
 * share it.
 */
export interface Food {
  name: string;
  grams?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  sugarG?: number;
  fiberG?: number;
  fatG?: number;
  satFatG?: number;
  alcoholG?: number;
  caffeineMg?: number;
  saltG?: number;
}

export const NUTRIENTS = [
  { key: "kcal", label: "kcal", unit: "" },
  { key: "proteinG", label: "proteína", unit: " g" },
  { key: "carbsG", label: "hidratos", unit: " g" },
  { key: "sugarG", label: "azúcar", unit: " g" },
  { key: "fiberG", label: "fibra", unit: " g" },
  { key: "fatG", label: "grasa", unit: " g" },
  { key: "satFatG", label: "saturada", unit: " g" },
  { key: "saltG", label: "sal", unit: " g" },
  { key: "alcoholG", label: "alcohol", unit: " g" },
  { key: "caffeineMg", label: "cafeína", unit: " mg" },
] as const;

/** How each meal is called on screen and to the agent. */
export const MEAL_NAMES: Record<string, string> = { breakfast: "Desayuno", lunch: "Comida", dinner: "Cena", snack: "Picoteo", drink: "Bebida" };

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export type Totals = Record<NutrientKey, number>;

/** The foods added up; a nutrient the agent left out counts as nothing. */
export function totals(foods: Food[]): Totals {
  const out = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0])) as Totals;
  for (const f of foods) for (const n of NUTRIENTS) out[n.key] += f[n.key] ?? 0;
  return out;
}

/** 1,6 g per kg with strength training (Morton 2018): above it, nothing more. Rounded to 5. */
export const proteinTarget = (weightKg: number) => Math.round((1.6 * weightKg) / 5) * 5;

/** 25 to 29 g a day (Reynolds 2019); the floor is the target. */
export const FIBER_TARGET = 25;

const whole = new Intl.NumberFormat("es-ES", { useGrouping: true, maximumFractionDigits: 0 });
const tenth = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
/** «1.022», not «1022» (es-ES leaves four digits ungrouped); under 10 with its tenth, so 0,3 g of salt is not «0 g». */
export const amount = (n: number) => (Math.abs(n) < 10 ? tenth.format(n) : whole.format(n));

/** «1.640 kcal · 98 g proteína · 180 g hidratos · 22 g fibra»: the kcal and the three that say most after them. */
export function totalsLine(t: Totals): string {
  return [`${amount(t.kcal)} kcal`, `${amount(t.proteinG)} g proteína`, `${amount(t.carbsG)} g hidratos`, `${amount(t.fiberG)} g fibra`].join(" · ");
}

/**
 * What he repeats: the same foods at the same meal, twice or more, so «lo de
 * siempre» has something to point at. Newest first in; out, the newest of
 * each, most repeated first.
 */
export function usual(meals: { id: number; meal?: string; foods?: Food[] }[], max = 6): { id: number; times: number }[] {
  const seen = new Map<string, { id: number; times: number }>();
  for (const m of meals) {
    if (!m.foods?.length) continue;
    const key = [m.meal ?? "", ...m.foods.map((f) => f.name.trim().toLowerCase()).sort()].join("|");
    const s = seen.get(key);
    if (s) s.times += 1;
    else seen.set(key, { id: m.id, times: 1 });
  }
  return [...seen.values()].filter((s) => s.times >= 2).sort((a, b) => b.times - a.times).slice(0, max);
}

/**
 * A day's totals only count when lunch and dinner are both in, food by food:
 * a day with only lunch told would pass for a day of eating little, and the
 * comparisons would learn that eating little is what he does on busy days.
 */
export function complete(meals: { meal?: string; foods?: Food[] }[]): boolean {
  const told = (m: string) => meals.some((x) => x.meal === m && (x.foods?.length ?? 0) > 0);
  return told("lunch") && told("dinner");
}
