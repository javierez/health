import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "~/db";
import { commitments, productUses, products, MOMENTS } from "~/db/schema";
import { isRoutine, ROUTINE_TITLE, routineTitle, sameProduct, type Member } from "~/lib/routines";

/** Each routine's products, by the title of its commitment. */
export async function loadMembers(): Promise<Map<string, Member[]>> {
  const rows = await db
    .select({ id: products.id, name: products.name, kind: products.kind, moment: products.moment })
    .from(products)
    .where(and(isNull(products.retiredAt), isNotNull(products.moment)))
    .orderBy(asc(products.id));
  const map = new Map<string, Member[]>();
  for (const { moment, ...p } of rows) {
    const title = routineTitle(moment);
    if (title) map.set(title, [...(map.get(title) ?? []), p]);
  }
  return map;
}

/**
 * After a product joins or leaves a routine: a routine with products is an
 * active daily commitment and an empty one stops. A product's own habit from
 * before («Hyalu B5 Serum», with a photo) stops too: its routine says it now.
 */
export async function syncRoutines(): Promise<void> {
  const members = await loadMembers();
  const all = await db.select().from(commitments);
  for (const moment of MOMENTS) {
    const title = ROUTINE_TITLE[moment];
    const want = (members.get(title)?.length ?? 0) > 0;
    // The same row comes back, and with it the days already ticked.
    const row = all.find((c) => c.title === title);
    if (row && row.active !== want) await db.update(commitments).set({ active: want }).where(eq(commitments.id, row.id));
    if (!row && want) await db.insert(commitments).values({ title, activities: [], metric: "sessions", target: 1, period: "day", proof: "check" });
  }
  const inRoutine = [...members.values()].flat();
  const own = all.filter(
    (c) => c.active && c.activities.length === 0 && !isRoutine(c.title) && inRoutine.some((p) => sameProduct(c.title, p.name)),
  );
  if (own.length > 0) await db.update(commitments).set({ active: false }).where(inArray(commitments.id, own.map((c) => c.id)));
}

/**
 * A routine ticked is each of its products used that day: a supplement in it
 * is still compared on its own in «Cómo te afecta» (creams never are).
 */
export async function markRoutine(title: string, day: string, on: boolean): Promise<void> {
  const moment = MOMENTS.find((m) => ROUTINE_TITLE[m] === title);
  if (!moment) return;
  const ids = (
    await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.moment, moment), isNull(products.retiredAt)))
  ).map((p) => p.id);
  if (ids.length === 0) return;
  if (on) await db.insert(productUses).values(ids.map((productId) => ({ productId, day }))).onConflictDoNothing();
  else await db.delete(productUses).where(and(eq(productUses.day, day), inArray(productUses.productId, ids)));
}
