import { and, desc, eq } from "drizzle-orm";

import { db } from "~/db";
import { facts, type FactData } from "~/db/schema";
import { localDay } from "~/lib/day";
import { FIBER_TARGET, proteinTarget, totals, type Food, type Totals } from "~/lib/food";

export interface FoodView {
  /** Today's meals added up; null with nothing told. */
  totals: Totals | null;
  /** What protein and fibre a day should reach, from his weight. */
  targets: { proteinG: number; fiberG: number };
}

/** His weight in the medical file (ORL, 01/10/2026), until the scale says otherwise. */
const WEIGHT_KG = 75;

/** His last weight on the scale. */
export async function loadWeight(): Promise<number> {
  const [scale] = await db.select({ data: facts.data }).from(facts).where(eq(facts.kind, "body")).orderBy(desc(facts.at)).limit(1);
  return (scale?.data as FactData | undefined)?.weightKg ?? WEIGHT_KG;
}

/** A meal's foods, or the meal as one food when it came without them. */
function foodsOf(d: FactData, summary: string): Food[] {
  if (d.foods?.length) return d.foods;
  return [{ name: d.items?.join(", ") ?? summary, kcal: d.kcal, proteinG: d.proteinG }];
}

/**
 * «Comida» in the panel: how far today is from his protein and fibre, what he
 * can still close. The meals themselves are in «Datos» (Javier, 18-oct-2026:
 * «lo que pueda hacer a continuación más que el pasado»).
 */
export async function loadFood(now = new Date()): Promise<FoodView> {
  const [rows, weightKg] = await Promise.all([
    db
      .select({ summary: facts.summary, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "meal"), eq(facts.day, localDay(now)))),
    loadWeight(),
  ]);
  return {
    totals: rows.length > 0 ? totals(rows.flatMap((r) => foodsOf(r.data as FactData, r.summary))) : null,
    targets: { proteinG: proteinTarget(weightKg), fiberG: FIBER_TARGET },
  };
}
