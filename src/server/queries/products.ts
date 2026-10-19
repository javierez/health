import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "~/db";
import { kinds, productUses, products, type Product } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";

export interface ProductView extends Product {
  /** The days he used it in the last eight weeks, newest first. */
  uses: string[];
  /** Its icon is still being drawn. */
  drawing: boolean;
}

/** What he uses now, oldest first, with the days he used each: the card in the panel and the agent's list. */
export async function loadProducts(now = new Date()): Promise<ProductView[]> {
  const since = addDays(localDay(now), -56);
  const [list, uses] = await Promise.all([
    db
      .select({ p: products, icon: kinds.status })
      .from(products)
      .leftJoin(kinds, eq(kinds.key, products.kind))
      .where(isNull(products.retiredAt))
      .orderBy(asc(products.createdAt)),
    db
      .select({ productId: productUses.productId, day: productUses.day })
      .from(productUses)
      .where(gte(productUses.day, since))
      .orderBy(desc(productUses.day)),
  ]);
  return list.map(({ p, icon }) => ({
    ...p,
    uses: uses.filter((u) => u.productId === p.id).map((u) => u.day),
    drawing: icon === "pending" || icon === "drawing",
  }));
}

/** «Lo he usado hoy» from the panel; a second tap the same day takes it back. */
export async function toggleUse(id: number, now = new Date()): Promise<{ used: boolean } | null> {
  const day = localDay(now);
  const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, id), isNull(products.retiredAt)));
  if (!p) return null;
  const gone = await db
    .delete(productUses)
    .where(and(eq(productUses.productId, id), eq(productUses.day, day)))
    .returning({ id: productUses.id });
  if (gone.length > 0) return { used: false };
  await db.insert(productUses).values({ productId: id, day, at: now });
  return { used: true };
}
