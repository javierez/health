"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { FindingDetail } from "~/components/finding-detail";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { ink } from "~/lib/scale";
import { cn } from "~/lib/utils";
import type { Finding } from "~/server/insights/findings";
import { tiers } from "~/server/insights/tiers";
import { OUTCOMES, points } from "~/server/insights/outcomes";

const SHOWN = 8;

/**
 * Whether his conversations show in his body (Javier, 18-oct-2026: «útil para
 * hacer correlaciones»): the same comparisons as «Cómo te afecta», only the
 * ones about WhatsApp and the Pocket (`isConversation`), every outcome in one
 * list. A tap opens both sides night by night.
 */
export function ConversationEffects({ mine, className, style }: { mine: Finding[]; className?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState<Finding | null>(null);
  const groups = tiers(mine).map((g) => ({ ...g, list: g.list.slice(0, SHOWN) }));
  return (
    <Card className={cn("p-4 animate-rise motion-reduce:animate-none", className)} style={style}>
      <div className="flex items-center justify-between gap-2 px-2">
        <h2 className="text-sm font-medium text-gray-900">¿Se nota en tu cuerpo?</h2>
        <Button asChild size="toolbar" variant="outline" className="-my-1">
          <Link href="/?ver=efectos">Cómo te afecta</Link>
        </Button>
      </div>
      {groups.every((g) => g.list.length === 0) ? (
        <p className="px-2 pt-2 text-sm text-gray-500">Aún nada: ninguna comparación tiene noches suficientes.</p>
      ) : null}
      {groups.map((g) =>
        g.list.length === 0 ? null : (
          <div key={g.label} className="mt-2">
            <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">{g.label}</p>
            <ul>
              {g.list.map((f) => (
                <li key={`${f.key}-${f.outcome}`}>
                  <button
                    type="button"
                    onClick={() => setOpen(f)}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="min-w-0 flex-1 text-sm text-gray-900">
                      {f.title}
                      {/* Both sides and how many nights each: what makes the number mean something. */}
                      <span className="block text-xs text-gray-500">
                        <span className="sm:hidden">{OUTCOMES[f.outcome].label} · </span>
                        {f.detail}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">{OUTCOMES[f.outcome].label}</span>
                    <span
                      className={cn(
                        "w-20 shrink-0 whitespace-nowrap text-right text-sm font-medium tabular-nums",
                        f.tier === "unclear" ? "text-gray-400" : ink(f.outcome, f.points),
                      )}
                    >
                      {points(f.outcome, f.points)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.title} className="w-[min(92vw,36rem)]">
        {open ? <FindingDetail finding={open} /> : null}
      </Modal>
    </Card>
  );
}
