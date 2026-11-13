import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { PRODUCT_AREAS, productUses, products, SKIN_CATEGORIES, MOMENTS, type ProductArea, type SkinCategory, type Moment } from "~/db/schema";
import { localDay } from "~/lib/day";
import { sinRayas } from "~/lib/sin-rayas";
import { routineTitle } from "~/lib/routines";
import { routineName } from "~/lib/skin";
import { ensureKind } from "~/server/kinds";
import { fillInfoLater } from "~/server/products/lookup";
import { syncRoutines } from "~/server/routines";
import type { TurnState } from "./tools";

/**
 * «Me acabo de echar esta crema», «esta es mi creatina»: what he uses, takes,
 * eats or drinks, from a photo. A new one is saved, its card searched on the
 * web and its icon drawn from the photo, both after the reply; a known one
 * just counts today. Each day used is a day in «Cómo te afecta». «Por la
 * mañana» puts it in that routine (`~/server/routines`), ticked with one tap.
 */
export const PRODUCT_TOOL: Anthropic.Tool = {
  name: "producto",
  description:
    "Guarda una crema o un suplemento que enseña en foto o dice por su nombre, apunta que lo ha usado hoy, lo pone en su rutina (en ayunas, mañana, media mañana, noche o antes de entrenar: lo que se echa o toma a la vez y marca de un toque, sin foto), o retira uno que ya no usa.",
  input_schema: {
    type: "object",
    properties: {
      guardar: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Como en la etiqueta, corto: «Fusion Water SPF 50», «Creatina monohidrato»." },
            marca: { type: "string" },
            area: { type: "string", enum: [...PRODUCT_AREAS] },
            categoria: { type: "string", enum: [...SKIN_CATEGORIES], description: "Solo cremas; lo demás, otro." },
            spf: { type: "number" },
            activo: { type: "string", description: "El activo y su dosis, si salen: «Retinol 0,3 %», «Magnesio 300 mg»." },
            momento: { type: "string", enum: [...MOMENTS], description: "Su rutina, si dice cuándo lo usa cada día; mañana y noche si lo usa en las dos (un limpiador)." },
            hoy: { type: "boolean", description: "true si lo acaba de usar o tomar." },
          },
          required: ["nombre", "area"],
        },
      },
      usar: { type: "array", items: { type: "integer" }, description: "Los [id] de sus productos que ha usado hoy." },
      rutina: {
        type: "array",
        description:
          "«El sérum y el contorno por la mañana», «la creatina a media mañana, 10 g»: sus [id] a esa rutina, o fuera de rutina con ninguna; activo si cambia la dosis.",
        items: {
          type: "object",
          properties: { id: { type: "integer" }, momento: { type: "string", enum: [...MOMENTS, "ninguna"] }, activo: { type: "string" } },
          required: ["id", "momento"],
        },
      },
      retirar: { type: "array", items: { type: "integer" }, description: "Los [id] que ya no usa." },
    },
  },
};

const entry = z.object({
  nombre: z.string().trim().min(1).max(80),
  marca: z.string().optional().catch(undefined),
  area: z.enum(PRODUCT_AREAS).catch("piel"),
  categoria: z.enum(SKIN_CATEGORIES).catch("otro"),
  spf: z.coerce.number().int().min(2).max(100).optional().catch(undefined),
  activo: z.string().optional().catch(undefined),
  momento: z.enum(MOMENTS).optional().catch(undefined),
  hoy: z.boolean().optional().catch(undefined),
});

export interface NewProduct {
  name: string;
  brand: string | null;
  area: ProductArea;
  category: SkinCategory;
  spf: number | null;
  ingredient: string | null;
  moment: Moment | null;
  today: boolean;
}

/** One bad entry drops that entry, not the rest. A cream's kind and SPF only for creams. */
export function parseProducts(input: unknown): NewProduct[] {
  const list = (input as { guardar?: unknown } | null)?.guardar;
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const e = entry.safeParse(item);
    if (!e.success) return [];
    const skin = e.data.area === "piel";
    const brand = e.data.marca?.trim();
    const ingredient = e.data.activo?.trim();
    return [
      {
        name: sinRayas(e.data.nombre),
        brand: brand ? sinRayas(brand) : null,
        area: e.data.area,
        category: skin ? e.data.categoria : "otro",
        spf: skin ? (e.data.spf ?? null) : null,
        ingredient: ingredient ? sinRayas(ingredient) : null,
        moment: e.data.momento ?? null,
        today: e.data.hoy ?? false,
      },
    ];
  });
}

const move = z.object({
  id: z.coerce.number().int().positive(),
  momento: z.enum([...MOMENTS, "ninguna"]),
  activo: z.string().trim().min(1).max(200).optional().catch(undefined),
});

/** «El sérum por la mañana», «la creatina, ahora 10 g»: one bad entry drops that entry, not the rest. */
export function parseMoves(input: unknown): { id: number; moment: Moment | null; ingredient?: string }[] {
  const list = (input as { rutina?: unknown } | null)?.rutina;
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const m = move.safeParse(item);
    if (!m.success) return [];
    const ingredient = m.data.activo ? { ingredient: sinRayas(m.data.activo) } : {};
    return [{ id: m.data.id, moment: m.data.momento === "ninguna" ? null : m.data.momento, ...ingredient }];
  });
}

const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** Its own icon from the photo; without one, a cream shares its routine's and the rest gets one by name. */
const iconFor = (p: NewProduct, photo: TurnState["image"]) =>
  photo ? ensureKind([p.brand, p.name].filter(Boolean).join(" "), photo) : ensureKind(p.area === "piel" ? routineName(p) : p.name);

export async function runProduct(input: unknown, s: TurnState): Promise<string> {
  const found = parseProducts(input);
  const today = localDay(s.at);
  const added =
    found.length > 0
      ? await db
          .insert(products)
          .values(
            await Promise.all(
              found.map(async ({ today: _, ...p }) => ({ ...p, kind: await iconFor({ ...p, today: false }, s.image), photoMessageId: s.photo })),
            ),
          )
          .returning({ id: products.id, name: products.name, area: products.area, category: products.category, moment: products.moment })
      : [];
  for (const p of added) fillInfoLater(p.id);

  const usedIds = [...ids((input as { usar?: unknown } | null)?.usar), ...added.filter((_, i) => found[i]?.today).map((p) => p.id)];
  const used =
    usedIds.length > 0
      ? await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(inArray(products.id, usedIds), isNull(products.retiredAt)))
      : [];
  if (used.length > 0) {
    await db
      .insert(productUses)
      .values(used.map((p) => ({ productId: p.id, day: today, at: s.at })))
      .onConflictDoNothing();
  }

  const gone = ids((input as { retirar?: unknown } | null)?.retirar);
  const retired =
    gone.length > 0
      ? await db
          .update(products)
          .set({ retiredAt: s.now })
          .where(and(inArray(products.id, gone), isNull(products.retiredAt)))
          .returning({ name: products.name })
      : [];

  const moved: { name: string; moment: string | null }[] = [];
  for (const m of parseMoves(input)) {
    const [row] = await db
      .update(products)
      .set({ moment: m.moment, ...(m.ingredient ? { ingredient: m.ingredient } : {}) })
      .where(and(eq(products.id, m.id), isNull(products.retiredAt)))
      .returning({ name: products.name, moment: products.moment });
    if (row) moved.push(row);
  }
  if (moved.length + retired.length > 0 || added.some((p) => p.moment)) await syncRoutines();

  const where = (p: { moment: string | null }) => routineTitle(p.moment) ?? "fuera de rutina";
  s.actions.push(
    ...added.map((p) => `En Productos: ${p.name}`),
    ...used.map((p) => `Usado hoy: ${p.name}`),
    ...moved.map((p) => `${p.name}: ${where(p)}`),
    ...retired.map((p) => `Fuera de Productos: ${p.name}`),
  );
  if (added.length + used.length + moved.length + retired.length === 0) return "Nada cambiado: faltaba el nombre o el id no está.";
  return [
    ...added.map(
      (p) =>
        `[${p.id}] ${p.name}: guardado. Busco su ficha en internet y le dibujo su icono; en un minuto está en el panel.` +
        (p.moment ? ` Va en «${where(p)}».` : " Si lo usa a diario, pregúntale en qué momento y ponlo en esa rutina (rutina), sin foto."),
    ),
    ...used.map((p) => `Apuntado hoy: ${p.name}.`),
    ...moved.map((p) => `${p.name}: ${where(p)}. La rutina se marca entera de un toque.`),
    ...retired.map((p) => `Retirado: ${p.name}`),
  ].join("\n");
}
