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
import type { Finding, Findings } from "~/server/insights/findings";
import { points } from "~/server/insights/outcomes";

/**
 * What does his recovery good and what does it harm, just the thing, one per
 * row (Javier, 18-oct-2026: «lo menos posible»). A tap opens what to do and
 * every night of both sides; «Ver todo» the other outcomes.
 */
export function FindingsCard({ findings, className, style }: { findings: Findings; className?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState<Finding | null>(null);
  // Only what he does: a Sunday does him no good, it goes with his good nights.
  const good = findings.by.recovery.good.filter((f) => f.controllable);
  const bad = findings.by.recovery.bad.filter((f) => f.controllable);
  const top = Math.max(1, ...[...good, ...bad].map((f) => Math.abs(f.points)));
  return (
    <Card className={cn("p-4 animate-rise motion-reduce:animate-none", className)} style={style}>
      <div className="flex items-center gap-3 px-2">
        <h2 className="text-sm font-medium text-gray-900">Para recuperarte</h2>
        <Button asChild size="toolbar" variant="outline" className="ml-auto">
          <Link href="/?ver=efectos">Ver todo</Link>
        </Button>
      </div>

      {good.length === 0 && bad.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-gray-500">Aún no hay nada claro.</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {[
            { label: "Sigue", list: good },
            { label: "Evita", list: bad },
          ].map((col) => (
            <div key={col.label}>
              <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">{col.label}</p>
              {col.list.length === 0 ? (
                <p className="px-2 py-3 text-sm text-gray-400">Nada claro todavía</p>
              ) : (
                <ul>
                  {col.list.map((f) => (
                    <li key={f.key}>
                      <button
                        type="button"
                        onClick={() => setOpen(f)}
                        className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", f.good ? "bg-gray-900" : "bg-amber-500")} />
                        <span className="min-w-0 flex-1 text-sm text-gray-900">{f.title}</span>
                        <span className={cn("shrink-0 text-sm font-medium tabular-nums", ink("recovery", f.points, top))}>{points("recovery", f.points)}</span>
                        <ChevronRight className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.title} className="w-[min(92vw,36rem)]">
        {open ? <FindingDetail finding={open} /> : null}
      </Modal>
    </Card>
  );
}
