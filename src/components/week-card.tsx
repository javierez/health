"use client";

import { useState, type CSSProperties } from "react";

import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { cn } from "~/lib/utils";
import { countOf, kindOf, type DayMark, type Standing } from "~/server/commitments/standing";
import { CommitmentCard, needs, range } from "./commitments";
import { Render, Stack } from "./tick";

/**
 * His commitments this week, a line each: what it is, what is left (amber when
 * it needs him) and the week as seven small dots. What still needs him goes
 * first: «¿qué me toca ahora?». How it goes opens on a tap.
 */
export function WeekCard({ list, today, style }: { list: Standing[]; today: string; style?: CSSProperties }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = list.find((s) => s.commitment.id === open);
  const week = list[0]?.days;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <div className="flex items-baseline justify-between gap-3 px-2">
        <h2 className="text-sm font-medium text-gray-900">Esta semana</h2>
        {week ? <span className="text-xs text-gray-500">{range(week[0]!.day, week[6]!.day)}</span> : null}
      </div>
      {list.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-gray-500">
          Díselo por WhatsApp: <span className="text-gray-900">«esta semana 4 de gimnasio»</span>
        </p>
      ) : (
        <ul className="mt-1">
          {[...list].sort((a, b) => Number(needs(b)) - Number(needs(a))).map((s) => {
            const count = countOf(s);
            return (
              <li key={s.commitment.id}>
                <button
                  type="button"
                  onClick={() => setOpen(s.commitment.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  {s.members?.length ? (
                    <Stack kinds={s.members.map((m) => m.kind)} />
                  ) : (
                    <Render area={s.commitment.activities[0] ?? "habit"} title={s.commitment.title} kind={kindOf(s.commitment)} size={32} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{s.commitment.title}</span>
                  {count ? (
                    <span className={cn("shrink-0 text-xs tabular-nums", needs(s) ? "text-amber-700" : "text-gray-500")}>{count}</span>
                  ) : null}
                  <MiniWeek s={s} today={today} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.commitment.title}>
        {shown ? <CommitmentCard s={shown} today={today} /> : null}
      </Modal>
    </Card>
  );
}

/** Seven dots, Monday to Sunday: ink when done, amber when a night went past the cap or today still asks. */
export function MiniWeek({ s, today }: { s: Standing; today: string }) {
  const bed = s.commitment.metric === "bedtime";
  const tone = (d: DayMark) => {
    if (bed && d.by === "auto" && d.value === 0) return "bg-amber-400";
    if (d.by !== null && (d.by !== "auto" || d.value > 0)) return "bg-gray-900";
    if (d.day > today) return "bg-gray-100";
    if (d.day === today && needs(s)) return "ring-1 ring-inset ring-amber-400";
    return "bg-gray-200";
  };
  return (
    <span className="flex shrink-0 gap-1" aria-hidden>
      {s.days.map((d) => (
        <span key={d.day} className={cn("size-2.5 rounded-full", tone(d))} />
      ))}
    </span>
  );
}
