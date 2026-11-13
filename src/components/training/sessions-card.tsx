"use client";

import { useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";

import { Card } from "~/components/ui/card";
import { nextOf, subOf, titleOf, weekday, weeksOf } from "~/lib/sessions";
import { cn } from "~/lib/utils";
import type { RoutineCard, Session, SessionLine } from "~/server/training/summary";
import { Move, Moves } from "./move";

/**
 * «Sesiones» by week, one line each: its date, its name, what it took and
 * the drawings of what he did. A tap opens it set by set. All closed: the
 * last one is already in «Rutinas» or was «Hoy».
 */
export function SessionsCard({ sessions, today, style }: { sessions: Session[]; today: string; style?: CSSProperties }) {
  const [open, setOpen] = useState<string | null>(null);
  // The weeks count today too; today's row is the «Hoy» card above.
  const weeks = weeksOf(sessions, today)
    .map((w) => ({ ...w, sessions: w.sessions.filter((s) => s.day !== today) }))
    .filter((w) => w.sessions.length > 0);
  if (weeks.length === 0) return null;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <h2 className="px-2 text-sm font-medium text-gray-900">Sesiones</h2>
      {weeks.map((w) => (
        <div key={w.label} className="mt-2 first-of-type:mt-1">
          <p className="flex items-baseline px-2 pt-2 pb-1 text-xs font-medium text-gray-500">
            <span>{w.label}</span>
            <span className="ml-auto tabular-nums">{w.meta}</span>
          </p>
          <ul>
            {w.sessions.map((s) => (
              <li key={s.day}>
                <SessionRow session={s} open={open === s.day} onToggle={() => setOpen(open === s.day ? null : s.day)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function SessionRow({ session: s, open, onToggle }: { session: Session; open: boolean; onToggle: () => void }) {
  const exercises = s.lines.filter((l) => !l.sport);
  const head = (
    <>
      <DateBox day={s.day} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{titleOf(s)}</span>
        {subOf(s) ? <span className="block truncate text-xs text-gray-500 tabular-nums">{subOf(s)}</span> : null}
        {open ? null : <Moves moves={exercises.map((l) => l.move)} />}
      </span>
    </>
  );
  if (exercises.length === 0) return <div className="flex items-center gap-3 px-2 py-2">{head}</div>;
  return (
    <>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50">
        {head}
        <ChevronRight className={cn("size-4 shrink-0 text-gray-300 transition-transform", open && "rotate-90")} />
      </button>
      {open ? <Exercises lines={s.lines} className="mb-2 ml-12" /> : null}
    </>
  );
}

function DateBox({ day, live }: { day: string; live?: boolean }) {
  return (
    <span className={cn("flex w-10 shrink-0 flex-col items-center rounded-xl py-1", live ? "bg-amber-50" : "bg-gray-50")}>
      <span className="text-base leading-none font-semibold text-gray-900 tabular-nums">{Number(day.slice(8))}</span>
      <span className="mt-0.5 text-[11px] text-gray-500">{weekday(day)}</span>
    </span>
  );
}

/** Each exercise with its drawing and its sets as pills; a sport with its km and minutes. */
function Exercises({ lines, className }: { lines: SessionLine[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-gray-100", className)}>
      {lines.map((l) => (
        <li key={l.name} className="flex gap-3 px-2 py-2">
          {l.move?.drawn ? <Move move={l.move} size={40} /> : <span className="w-[30px] shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{l.name}</p>
            {l.sets.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {l.sets.map((t, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 tabular-nums">
                    {t}
                  </span>
                ))}
              </div>
            ) : l.text ? (
              <p className="text-xs text-gray-500 tabular-nums">{l.text}</p>
            ) : null}
            {l.learning ? <p className="text-xs text-gray-400">buscando qué trabaja</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Today's session, open, filling in as he tells it: with a routine, how far and what comes next. */
export function TodayCard({ sessions, routines, today, style }: { sessions: Session[]; routines: RoutineCard[]; today: string; style?: CSSProperties }) {
  const s = sessions.find((x) => x.day === today);
  if (!s) return null;
  const routine = routines.find((r) => r.id === s.routineId);
  const next = routine ? nextOf(routine.exercises.map((e) => e.name), s) : null;
  const nextMove = routine?.exercises.find((e) => e.name === next)?.move;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <p className="flex items-baseline gap-2 px-2">
        <span className="size-2 shrink-0 self-center rounded-full bg-amber-500" />
        <span className="truncate text-sm font-medium text-gray-900">Hoy · {titleOf(s)}</span>
        <span className="ml-auto text-xs whitespace-nowrap text-gray-500 tabular-nums">
          {s.routine ? `${s.routine.done} de ${s.routine.of}` : subOf(s)}
        </span>
      </p>
      {s.routine ? (
        <div className="mt-2 flex gap-1 px-2">
          {Array.from({ length: s.routine.of }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < s.routine!.done ? "bg-gray-900" : "bg-gray-200")} />
          ))}
        </div>
      ) : null}
      <Exercises lines={s.lines} className="mt-1" />
      {next ? (
        <div className="mt-1 flex items-center gap-3 rounded-xl bg-gray-50 px-2 py-2">
          {nextMove?.drawn ? <Move move={nextMove} size={32} /> : null}
          <p className="text-sm">
            <span className="text-gray-500">Ahora</span> <span className="font-medium text-gray-900">{next}</span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}
