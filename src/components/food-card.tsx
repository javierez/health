"use client";

import type { CSSProperties } from "react";
import { Camera } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { amount as fmt } from "~/lib/food";
import type { Standing } from "~/server/commitments/standing";
import type { FoodView } from "~/server/queries/food";
import type { ProductView } from "~/server/queries/products";
import { ProductGrid } from "./products-card";
import { chatLink } from "./tick";

const ASK = "Esto es lo que como";

/**
 * «Comida»: what is left to close today, protein and fibre against his
 * target, and his supplements («todos los suplementos»). A photo in the chat
 * adds a meal; the meals themselves live in «Datos».
 */
export function FoodCard({
  food,
  supplements,
  list,
  today,
  style,
}: {
  food: FoodView;
  supplements: ProductView[];
  list: Standing[];
  today: string;
  style?: CSSProperties;
}) {
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <div className="flex items-center gap-3 px-2">
        <h2 className="text-sm font-medium text-gray-900">Comida</h2>
        <Button asChild size="toolbar" variant="ghost" className="ml-auto">
          <a href={chatLink(ASK)} target="_blank" rel="noreferrer">
            <Camera />
            Foto
          </a>
        </Button>
      </div>
      <div className="mt-2 space-y-1.5 px-2">
        <Target label="Proteína" value={food.totals?.proteinG ?? 0} of={food.targets.proteinG} />
        <Target label="Fibra" value={food.totals?.fiberG ?? 0} of={food.targets.fiberG} />
      </div>
      {supplements.length > 0 ? (
        <div className="mt-3">
          <h3 className="px-2 text-xs font-medium text-gray-500">Suplementos</h3>
          <ProductGrid products={supplements} list={list} today={today} />
        </div>
      ) : null}
    </Card>
  );
}

/** «Proteína ▬▬▬▬▬▭▭ 98 / 120 g». */
function Target({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 text-gray-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (value / of) * 100)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-gray-900 tabular-nums">
        {fmt(value)} / {fmt(of)} g
      </span>
    </div>
  );
}
