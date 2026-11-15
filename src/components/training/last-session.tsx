"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

import { MetalHeart } from "~/components/metal-heart";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { dayTitle, localClock } from "~/lib/day";
import { hours, nextOf, titleOf } from "~/lib/sessions";
import { cn } from "~/lib/utils";
import type { WorkoutView } from "~/server/queries/training";
import type { Lift, RoutineCard } from "~/server/training/summary";
import { ExerciseDetail, Tile } from "./exercise-detail";
import { Move } from "./move";

/** Each exercise on the big stage: two reps, then the next. */
const STAGE_MS = 5_200;

export const tons = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} t` : `${kg} kg`);

/**
 * The last session on top (Javier, 14-nov-2026: «el 3D más grande»): its
 * exercises one after the other on a big stage, the small ones still until
 * picked, its numbers, Pulso's score and its own page. A tap on the stage
 * opens that exercise set by set.
 */
export function LastSession({ view, lifts, routines, today, style }: { view: WorkoutView; lifts: Lift[]; routines: RoutineCard[]; today: string; style?: CSSProperties }) {
  const { session: s, stats, score } = view;
  const exercises = s.lines.filter((l) => !l.sport || l.move?.drawn);
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (exercises.length < 2 || open !== null) return;
    const t = setTimeout(() => setAt((at + 1) % exercises.length), STAGE_MS);
    return () => clearTimeout(t);
  }, [at, exercises.length, open]);
  const e = exercises[at];
  const shown = open === null ? undefined : exercises[open];
  const routine = s.day === today ? routines.find((r) => r.id === s.routineId) : undefined;
  const next = routine ? nextOf(routine.exercises.map((x) => x.name), s) : null;

  return (
    <Card className="grid gap-4 p-4 animate-rise motion-reduce:animate-none md:grid-cols-5" style={style}>
      <div className="min-w-0 md:col-span-3">
        <button
          type="button"
          onClick={() => e && setOpen(at)}
          className="relative flex h-[22rem] w-full flex-col items-center justify-end rounded-xl bg-gradient-to-b from-gray-50 to-white pb-3"
        >
          {e ? (
            <span key={at} className="flex flex-col items-center animate-fade-in motion-reduce:animate-none">
              {e.move?.drawn ? <Move move={e.move} size={280} /> : null}
              <span className="mt-1 text-base font-semibold text-gray-900">{e.name}</span>
              {e.sets.length > 0 ? (
                <span className="mt-1 flex flex-wrap justify-center gap-1">
                  {e.sets.map((t, i) => (
                    <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 tabular-nums">
                      {t}
                    </span>
                  ))}
                </span>
              ) : e.text ? (
                <span className="mt-1 text-xs text-gray-500 tabular-nums">{e.text}</span>
              ) : null}
            </span>
          ) : null}
          {exercises.length > 1 ? <span className="absolute top-3 left-3 text-xs text-gray-400 tabular-nums">{at + 1} / {exercises.length}</span> : null}
        </button>
        {exercises.length > 1 ? (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {exercises.map((x, i) => (
              <button
                key={x.name}
                type="button"
                onClick={() => setAt(i)}
                aria-label={x.name}
                className={cn("group shrink-0 rounded-xl bg-gray-50 p-1", i === at && "ring-2 ring-gray-900")}
              >
                {x.move?.drawn ? <Move move={x.move} size={56} still={i !== at} /> : <span className="block h-14 w-[42px]" />}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col md:col-span-2">
        <p className="flex items-center gap-2 text-sm text-gray-500">
          {s.day === today ? <span className="size-2 rounded-full bg-amber-500" /> : null}
          {dayTitle(s.day, today)}
          {s.span ? ` · ${localClock(s.span.from)}` : null}
        </p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{titleOf(s)}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Tile label="Duración" value={stats.minutes ? hours(stats.minutes) : "–"} />
          <Tile label="Series" value={stats.sets || "–"} />
          <Tile label="Movido" value={stats.moved ? tons(stats.moved) : "–"} />
          <Tile label="Pulso medio" value={stats.avgHr ? <><MetalHeart />{stats.avgHr}</> : "–"} />
          <Tile label="Pulso máx" value={stats.maxHr ? <><MetalHeart />{stats.maxHr}</> : "–"} />
          <Tile label="Nota de Pulso" value={`${score.score}/10`} tone="amber" />
        </dl>
        {next ? (
          <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">Ahora</span> <span className="font-medium text-gray-900">{next}</span>
          </p>
        ) : null}
        <Button asChild className="mt-4 rounded-full md:mt-auto">
          <Link href={view.path}>Ver el entreno</Link>
        </Button>
      </div>

      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.name} className="w-[min(92vw,30rem)]">
        {shown ? <ExerciseDetail line={shown} other={otherDays(lifts, shown.name, s.day)} /> : null}
      </Modal>
    </Card>
  );
}

/** The other days of this exercise, newest first. */
export function otherDays(lifts: Lift[], name: string, day: string) {
  return [...(lifts.find((l) => l.name === name)?.points ?? [])]
    .filter((p) => p.day !== day)
    .reverse()
    .map((p) => ({ day: p.day, sets: p.sets }));
}
