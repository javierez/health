"use client";

import { useState } from "react";

import { cn } from "~/lib/utils";
import type { Progress, ProgressCard } from "~/server/queries/progress";

/**
 * How the weeks are going: every card, twelve weeks each, in «Datos». Amber
 * only when one moves the wrong way; a bar says its week on a tap. Off the
 * panel since 17-oct-2026: the panel says what to do, the numbers are one
 * click away.
 */
const SERIES = ["bg-gray-800", "bg-gray-300"];
/** Which way is worse: less sleep and recovery, more calls. Weight and code just are. */
const WORSE: Partial<Record<ProgressCard["key"], "up" | "down">> = { sleep: "down", recovery: "down", training: "down", calls: "up" };
const worse = (c: ProgressCard) => c.delta !== null && WORSE[c.key] === (c.delta.up ? "up" : "down");

export function Trends({ progress }: { progress: Progress }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {progress.cards.map((c) => (
        <Kpi key={c.key} card={c} axis={progress.axis} />
      ))}
    </div>
  );
}

function Kpi({ card, axis }: { card: ProgressCard; axis: [string, string] }) {
  const [week, setWeek] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{card.title}</p>
        {card.delta ? (
          <span className={cn("rounded-full bg-white px-2 py-0.5 text-xs tabular-nums", worse(card) ? "text-amber-700" : "text-gray-600")}>
            {card.delta.text}
          </span>
        ) : null}
      </div>
      {card.value === null ? (
        <p className="py-8 text-center text-sm text-gray-500">{card.empty}</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
            {card.value} <span className="text-sm font-normal text-gray-500">{card.unit}</span>
          </p>
          <p className="min-h-4 truncate text-xs text-gray-500">{week ?? card.note}</p>
          <Bars card={card} height="h-16" delay={0.1} onPick={setWeek} />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-400">
            <span>{axis[0]}</span>
            {card.legend ? (
              <span className="flex items-center gap-2.5">
                {card.legend.map((l, i) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className={cn("h-2 w-2 rounded-sm", SERIES[i])} />
                    {l}
                  </span>
                ))}
              </span>
            ) : null}
            <span>{axis[1]}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Bars({ card, height, delay, onPick }: { card: ProgressCard; height: string; delay: number; onPick?: (title: string) => void }) {
  const totals = card.weeks.map((w) => (w.values ? w.values.reduce((a, b) => a + b, 0) : 0));
  const top = Math.max(...totals, card.floor + 1);
  const span = top - card.floor;
  const last = card.weeks.length - 1;
  return (
    <div className={cn("mt-3 flex items-end gap-0.5", height)}>
      {card.weeks.map((w, i) => (
        <div
          key={w.end}
          onClick={onPick ? () => onPick(w.title) : undefined}
          className={cn("flex h-full flex-1 origin-bottom flex-col-reverse animate-grow motion-reduce:animate-none", onPick && "cursor-pointer")}
          style={{ animationDelay: `${delay + i * 0.04}s` }}
        >
          {w.values === null || totals[i] === 0 ? (
            <div className="h-0.5 rounded-sm bg-gray-200" />
          ) : (
            w.values.map((v, s) => {
              // The floor comes off the bottom segment only.
              const base = s === 0 ? card.floor : 0;
              const stacked = w.values!.length > 1;
              return (
                <div
                  key={s}
                  className={cn(
                    s === w.values!.length - 1 && "rounded-t-sm",
                    stacked ? SERIES[s] : i === last ? (worse(card) ? "bg-amber-500" : "bg-gray-800") : "bg-gray-300",
                  )}
                  style={{ height: `${Math.max(((v - base) / span) * 100, s === 0 ? 4 : 0)}%` }}
                />
              );
            })
          )}
        </div>
      ))}
    </div>
  );
}
