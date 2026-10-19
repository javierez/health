import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { products, type Product, type ProductInfo } from "~/db/schema";
import { sinRayas } from "~/lib/sin-rayas";
import { later } from "~/server/kinds";
import { research } from "~/server/web-research";

/**
 * What the web says about a product he sent a photo of: what it is, what is
 * in it and does something, what to watch, how to use it, with its sources.
 * One Sonnet call with web search, once per product, after the reply.
 */
export const PROMPT_VERSION = "product-info-v1";
const MAX_ATTEMPTS = 3;
const STALE_MS = 5 * 60_000;

const SYSTEM = `Buscas en internet la ficha de un producto que usa Javier: una crema, un suplemento, una comida o una bebida.

Busca primero en Open Beauty Facts u Open Food Facts, INCIDecoder, la web de la marca o una farmacia. Luego llama a «ficha».

- Solo lo que encuentres. Si no sale la lista de ingredientes, déjala vacía. Nunca inventes una concentración.
- Ingredientes tal cual en el envase (INCI en las cremas), en orden.
- Activos: solo los que hacen algo, cada uno con lo que hace en pocas palabras.
- Ojo con: irritantes, interacciones, dosis máximas, cafeína, alcohol. Nada si no hay nada.
- Español, frases cortas. Nunca uses rayas largas ni medias.`;

const FICHA = {
  name: "ficha",
  description: "La ficha del producto, con lo encontrado en la web.",
  input_schema: {
    type: "object" as const,
    properties: {
      resumen: { type: "string", description: "Una línea: qué es y para qué. «Sérum de retinol al 0,3 % para la noche.»" },
      activos: {
        type: "array",
        items: { type: "object", properties: { nombre: { type: "string" }, hace: { type: "string" } }, required: ["nombre", "hace"] },
      },
      ingredientes: { type: "array", items: { type: "string" } },
      ojo: { type: "array", items: { type: "string" } },
      uso: { type: "string", description: "Cómo y cuándo, en una línea." },
      fuentes: {
        type: "array",
        items: { type: "object", properties: { titulo: { type: "string" }, url: { type: "string" } }, required: ["titulo", "url"] },
      },
    },
    required: ["resumen", "activos", "ingredientes", "ojo", "uso", "fuentes"],
  },
};

const text = (max: number) => z.string().trim().min(1).max(max);
/** A bad item drops that item, not the list. */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.flatMap((x): z.output<T>[] => {
      const r = item.safeParse(x);
      return r.success ? [r.data] : [];
    }));
const fichaSchema = z.object({
  resumen: text(240),
  activos: list(z.object({ nombre: text(80), hace: text(200) })),
  ingredientes: list(text(120)),
  ojo: list(text(240)),
  uso: z.string().trim().max(240).catch(""),
  fuentes: list(z.object({ titulo: text(160), url: z.string().url().startsWith("http") })),
});

/** What the model filled in, cleaned and capped; null when there is not even a summary. */
export function parseInfo(input: unknown): ProductInfo | null {
  const f = fichaSchema.safeParse(input);
  if (!f.success) return null;
  return {
    summary: sinRayas(f.data.resumen),
    actives: f.data.activos.slice(0, 8).map((a) => ({ name: sinRayas(a.nombre), does: sinRayas(a.hace) })),
    ingredients: f.data.ingredientes.slice(0, 80),
    cautions: f.data.ojo.slice(0, 5).map(sinRayas),
    use: sinRayas(f.data.uso),
    sources: f.data.fuentes.slice(0, 5).map((s) => ({ title: sinRayas(s.titulo), url: s.url })),
  };
}

/** What changes per product, after the cache cut. */
const ask = (p: Pick<Product, "name" | "brand" | "area" | "ingredient">) =>
  `Producto: ${p.name}${p.brand ? `, de ${p.brand}` : ""} (${p.area}).${p.ingredient ? ` En la etiqueta: ${p.ingredient}.` : ""}`;

export async function lookup(p: Pick<Product, "name" | "brand" | "area" | "ingredient">): Promise<ProductInfo> {
  const info = parseInfo(await research(SYSTEM, FICHA, ask(p)));
  if (!info) throw new Error("ficha sin resumen");
  return info;
}

/** Searches one product's card, once: claims it first, so two calls never pay twice. */
export async function fillInfo(id: number): Promise<{ ok: boolean; error?: string }> {
  const claimed = await db
    .update(products)
    .set({ infoStatus: "searching", infoAttempts: sql`${products.infoAttempts} + 1`, infoUpdatedAt: new Date() })
    .where(
      and(
        eq(products.id, id),
        sql`(${products.infoStatus} in ('pending', 'failed') or (${products.infoStatus} = 'searching' and ${products.infoUpdatedAt} < ${new Date(Date.now() - STALE_MS).toISOString()}::timestamptz))`,
        lt(products.infoAttempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  const p = claimed[0];
  if (!p) return { ok: false, error: "ya buscado o en curso" };
  try {
    const info = await lookup(p);
    await db.update(products).set({ info, infoStatus: "ready", infoUpdatedAt: new Date() }).where(eq(products.id, id));
    return { ok: true };
  } catch (e) {
    await db.update(products).set({ infoStatus: "failed", infoUpdatedAt: new Date() }).where(eq(products.id, id));
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** After the reply: the chat never waits for the web. */
export const fillInfoLater = (id: number) => later(() => fillInfo(id));
