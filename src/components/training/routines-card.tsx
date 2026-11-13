"use client";

import { useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";

import { dayLabel } from "~/components/balance-card";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { RoutineCard } from "~/server/training/summary";
import { Move, Moves } from "./move";

/**
 * His saved routines, one line each like a session: its name, the last time
 * he did it (all or how much) and its drawings. A tap opens it in order.
 */
export function RoutinesCard({ routines, style }: { routines: RoutineCard[]; style?: CSSProperties }) {
  const [open, setOpen] = useState<number | null>(null);
  if (routines.length === 0) return null;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <h2 className="px-2 text-sm font-medium text-gray-900">Rutinas</h2>
      <ul className="mt-1">
        {routines.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(open === r.id ? null : r.id)}
              aria-expanded={open === r.id}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{r.name}</span>
                <span className="block truncate text-xs text-gray-500 tabular-nums">
                  {r.exercises.length} ejercicios · {r.last ? `${dayLabel(r.last.day)}, ${r.last.done} de ${r.exercises.length}` : "sin hacer todavía"}
                </span>
                {open === r.id ? null : <Moves moves={r.exercises.map((e) => e.move)} />}
              </span>
              <ChevronRight className={cn("size-4 shrink-0 text-gray-300 transition-transform", open === r.id && "rotate-90")} />
            </button>
            {open === r.id ? (
              <ol className="mb-2 space-y-1 px-2">
                {r.exercises.map((e, i) => (
                  <li key={`${i}-${e.name}`} className="flex items-center gap-2 text-sm">
                    <span className="w-4 shrink-0 text-xs text-gray-400 tabular-nums">{i + 1}</span>
                    {e.move?.drawn ? <Move move={e.move} size={32} /> : <span className="w-6 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate text-gray-900">{e.name}</span>
                    <span className="whitespace-nowrap text-gray-500 tabular-nums">{e.text}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
