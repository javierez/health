"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { routineOf, whenText } from "~/lib/skin";
import type { Standing } from "~/server/commitments/standing";
import type { ProductView } from "~/server/queries/products";
import { AREA, ProductDetail } from "./product-detail";
import { chatLink, Render } from "./tick";

const ASK = "Mira esta crema";
/** While a card is searched or an icon drawn, the panel looks again this often, for this long. */
const POLL_MS = 8_000;
const POLL_FOR_MS = 3 * 60_000;

/**
 * «Piel»: the creams he uses, each with its own 3D icon (Javier, 18-oct-2026:
 * «me acabo de echar esta crema… sacaras todos los datos… un icono 3D»).
 * Only what goes on his skin: what he eats, drinks or takes lives in «Comida»
 * («please don't mix it», 18-oct-2026). «Foto» opens the chat, where a photo
 * adds one; a tap opens its card.
 */
export function ProductsCard({ products, list, today, style }: { products: ProductView[]; list: Standing[]; today: string; style?: CSSProperties }) {
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <div className="flex items-center gap-3 px-2">
        <h2 className="text-sm font-medium text-gray-900">Piel</h2>
        {products.length > 0 ? (
          <>
            <span className="text-xs text-gray-500">{products.length}</span>
            <Button asChild size="toolbar" variant="ghost" className="ml-auto">
              <a href={chatLink(ASK)} target="_blank" rel="noreferrer">
                <Camera />
                Foto
              </a>
            </Button>
          </>
        ) : null}
      </div>
      {products.length === 0 ? (
        <a
          href={chatLink(ASK)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-200">
            <Camera className="size-4" />
          </span>
          Mándame la foto de una crema y la guardo aquí
        </a>
      ) : (
        <ProductGrid products={products} list={list} today={today} />
      )}
    </Card>
  );
}

/** His products as icons, three to a row; a tap opens its card. «Piel» and the supplements in «Comida» share it. */
export function ProductGrid({ products, list, today }: { products: ProductView[]; list: Standing[]; today: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = products.find((p) => p.id === open);
  const waiting = products.some((p) => p.drawing || p.infoStatus === "pending" || p.infoStatus === "searching");
  const router = useRouter();
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const t = setInterval(() => (Date.now() - started > POLL_FOR_MS ? clearInterval(t) : router.refresh()), POLL_MS);
    return () => clearInterval(t);
  }, [waiting, router]);

  return (
    <>
      <div className="mt-2 grid grid-cols-3 items-start gap-2">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(p.id)}
            className="flex min-w-0 flex-col items-center gap-1 rounded-xl p-2 text-center transition-colors hover:bg-gray-50"
          >
            <Render area="habit" title={p.name} kind={p.kind} size={48} />
            <span className="line-clamp-2 w-full text-xs leading-tight font-medium text-gray-900">{p.name}</span>
            <span className="w-full truncate text-[11px] text-gray-500">
              {p.uses[0] === today ? "Hoy ✓" : p.area === "piel" ? (whenText(p, routineOf(p, list)) ?? AREA.piel) : " "}
            </span>
          </button>
        ))}
      </div>

      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.name} className="w-[min(92vw,32rem)]">
        {shown ? <ProductDetail p={shown} list={list} today={today} /> : null}
      </Modal>
    </>
  );
}
