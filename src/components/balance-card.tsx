"use client";

import { useState, type CSSProperties } from "react";

import { Card } from "~/components/ui/card";
import { fill, ink } from "~/lib/scale";
import { cn } from "~/lib/utils";
import type { Balance, Score } from "~/server/insights/balance";
import { OUTCOMES, points, roundGap, type OutcomeKey } from "~/server/insights/outcomes";

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** «sáb 17». */
export const dayLabel = (day: string) => `${WEEKDAYS[new Date(`${day}T12:00:00`).getDay()]} ${Number(day.slice(8))}`;

/**
 * The day's score: what he did, each with its points, and the total.
 * Seven days below to see it move; a tap on one
 * shows that day.
 */
export function BalanceCard({ balance, outcome, className, style }: { balance: Balance; outcome: OutcomeKey; className?: string; style?: CSSProperties }) {
  const [at, setAt] = useState(balance.days.length - 1);
  const d = balance.days[at];
  if (!d) return null;
  const meta = OUTCOMES[outcome];
  const maxDay = Math.max(...balance.days.map((b) => Math.abs(b.total)));
  const maxItem = Math.max(...balance.days.flatMap((b) => b.items.map((x) => Math.abs(x.points))));
  return (
    <Card className={cn("space-y-3 p-4 animate-rise motion-reduce:animate-none", className)} style={style}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2">
        <span className="text-sm text-gray-500">Balance del {dayLabel(d.day)}</span>
        <span className={cn("text-2xl font-bold tabular-nums tracking-tight", ink(outcome, d.total, maxDay))}>{points(outcome, d.total)}</span>
        {d.actual !== null && outcome !== "nextLines" && outcome !== "symptoms" ? (
          <span className="ml-auto text-xs text-gray-500">
            {meta.label}: {meta.fmt(d.actual)}
            {balance.usual !== null ? ` · sueles ${meta.fmt(balance.usual)}` : ""}
          </span>
        ) : null}
      </div>

      {d.items.length === 0 ? (
        <p className="px-2 text-sm text-gray-500">Nada de lo que cuenta ese día.</p>
      ) : (
        <Scores outcome={outcome} list={d.items} max={maxItem} />
      )}

      <div className="grid grid-cols-7 gap-1 pt-1">
        {balance.days.map((b, i) => (
          <button
            key={b.day}
            type="button"
            onClick={() => setAt(i)}
            aria-pressed={i === at}
            className={cn(
              "rounded-xl px-1 py-1.5 text-center",
              // White letters on every day (Javier, 18-oct-2026): only the two darkest steps carry them.
              roundGap(outcome, b.total) === 0 ? "bg-gray-400" : fill(outcome, b.total, maxDay, 3),
              "text-white",
              i === at && "ring-2 ring-gray-900 ring-offset-1",
            )}
          >
            <span className="block whitespace-nowrap text-[10px] opacity-70">{dayLabel(b.day)}</span>
            <span className="block text-xs font-semibold tabular-nums">{points(outcome, b.total)}</span>
          </button>
        ))}
      </div>
      <p className="px-2 text-[11px] text-gray-400">Las cosas se solapan: es una guía, no una suma exacta.</p>
    </Card>
  );
}

function Scores({ outcome, list, max }: { outcome: OutcomeKey; list: Score[]; max: number }) {
  return (
    <ul>
      {list.map((s) => (
        <li key={s.key} className="flex items-baseline gap-3 px-2 py-1">
          <span className={cn("w-20 shrink-0 text-right text-sm font-medium tabular-nums", ink(outcome, s.points, max))}>
            {points(outcome, s.points)}
          </span>
          <span className={cn("min-w-0 flex-1 text-sm", "text-gray-900")}>{s.title}</span>
        </li>
      ))}
    </ul>
  );
}
