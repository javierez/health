"use client";

import { useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";

import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { monthsOf, subOf, titleOf, weekday } from "~/lib/sessions";
import { cn } from "~/lib/utils";
import type { Lift, Session, SessionLine } from "~/server/training/summary";
import { ExerciseDetail } from "./exercise-detail";
import { otherDays } from "./last-session";
import { Move, Moves } from "./move";

/**
 * «Sesiones» by month, one line each: its date, its name, what it took and
 * the drawings of what he did. The last two months open, the rest folded
 * (Javier, 14-nov-2026: «todas las sesiones»). A tap opens a session; a tap
 * on an exercise, its sets one by one.
 */
export function SessionsCard({ sessions, lifts, today, style }: { sessions: Session[]; lifts: Lift[]; today: string; style?: CSSProperties }) {
  const [open, setOpen] = useState<string | null>(null);
  const [line, setLine] = useState<{ line: SessionLine; day: string } | null>(null);
  const months = monthsOf(sessions, today);
  if (months.length === 0) return null;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <h2 className="px-2 text-sm font-medium text-gray-900">Todos tus entrenos</h2>
      {months.map((m, i) => (
        <details key={m.label} open={i < 2} className="group/month mt-1">
          <summary className="flex cursor-pointer list-none items-baseline rounded-xl px-2 pt-2 pb-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50">
            <span>{m.label}</span>
            <span className="ml-auto tabular-nums">{m.meta}</span>
            <ChevronRight className="ml-1 size-3.5 self-center text-gray-300 transition-transform group-open/month:rotate-90" />
          </summary>
          <ul>
            {m.sessions.map((s) => (
              <li key={s.day}>
                <SessionRow session={s} open={open === s.day} onToggle={() => setOpen(open === s.day ? null : s.day)} onLine={(l) => setLine({ line: l, day: s.day })} />
              </li>
            ))}
          </ul>
        </details>
      ))}
      <Modal open={line !== null} onClose={() => setLine(null)} title={line?.line.name} className="w-[min(92vw,30rem)]">
        {line ? <ExerciseDetail line={line.line} other={otherDays(lifts, line.line.name, line.day)} /> : null}
      </Modal>
    </Card>
  );
}

function SessionRow({ session: s, open, onToggle, onLine }: { session: Session; open: boolean; onToggle: () => void; onLine: (l: SessionLine) => void }) {
  const exercises = s.lines.filter((l) => !l.sport);
  const head = (
    <>
      <DateBox day={s.day} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{titleOf(s)}</span>
        {subOf(s) ? <span className="block truncate text-xs text-gray-500 tabular-nums">{subOf(s)}</span> : null}
        {open ? null : <Moves moves={s.lines.map((l) => l.move)} />}
      </span>
    </>
  );
  if (exercises.length === 0) return <div className="flex items-center gap-3 px-2 py-2">{head}</div>;
  return (
    <>
      <button type="button" onClick={onToggle} aria-expanded={open} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50">
        {head}
        <ChevronRight className={cn("size-4 shrink-0 text-gray-300 transition-transform", open && "rotate-90")} />
      </button>
      {open ? <Exercises lines={s.lines} onOpen={onLine} className="mb-2 ml-12" /> : null}
    </>
  );
}

function DateBox({ day }: { day: string }) {
  return (
    <span className="flex w-10 shrink-0 flex-col items-center rounded-xl bg-gray-50 py-1">
      <span className="text-base leading-none font-semibold text-gray-900 tabular-nums">{Number(day.slice(8))}</span>
      <span className="mt-0.5 text-[11px] text-gray-500">{weekday(day)}</span>
    </span>
  );
}

/** Each exercise with its drawing and its sets as pills; a sport with its km and minutes. */
function Exercises({ lines, onOpen, className }: { lines: SessionLine[]; onOpen: (l: SessionLine) => void; className?: string }) {
  return (
    <ul className={cn("divide-y divide-gray-100", className)}>
      {lines.map((l) => (
        <li key={l.name}>
          <button type="button" onClick={() => onOpen(l)} className="group flex w-full gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50">
            {l.move?.drawn ? <Move move={l.move} size={40} still /> : <span className="w-[30px] shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">{l.name}</span>
              {l.sets.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {l.sets.map((t, i) => (
                    <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 tabular-nums">
                      {t}
                    </span>
                  ))}
                </span>
              ) : l.text ? (
                <span className="block text-xs text-gray-500 tabular-nums">{l.text}</span>
              ) : null}
              {l.learning ? <span className="block text-xs text-gray-400">buscando qué trabaja</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
