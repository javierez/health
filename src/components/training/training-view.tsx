"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { dayLabel } from "~/components/balance-card";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { daysBetween } from "~/lib/day";
import { ZONE_LABEL, type Zone } from "~/lib/exercises";
import { cn } from "~/lib/utils";
import type { Lift, Training, ZoneWeek } from "~/server/training/summary";
import { BodyMap, Dot, HeatLegend, isForgotten, zoneFill } from "./body-map";
import { Move } from "./move";
import { RoutinesCard } from "./routines-card";
import { SessionsCard, TodayCard } from "./sessions-card";

const ASK = "Dime lo que entrenas: «press banca 3×8 a 80».";

/**
 * «Entrenos» (Javier, 18-oct-2026: «qué estoy entrenando, cuánto levanto,
 * cuántas series… qué zonas», and later «¿qué me toca ahora?»): what to train
 * next, how loaded each muscle of a real body still is, this week's sets, the
 * weight of each exercise over time, and the last sessions. Little text.
 */
export function TrainingView({ training, today }: { training: Training; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<Zone | null>(null);
  const shown = training.lifts.find((l) => l.name === open);
  const zone = training.zones.find((z) => z.zone === muscle);
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 animate-rise motion-reduce:animate-none">
        <h1 className="mr-auto text-2xl font-bold tracking-tight sm:text-3xl">Entrenos</h1>
        <Button asChild size="pill" variant="outline">
          <Link href="/?ver=panel">
            <ArrowLeft />
            Panel
          </Link>
        </Button>
      </header>

      {training.sessions.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-500 animate-rise motion-reduce:animate-none" style={{ animationDelay: "0.08s" }}>
          {ASK}
        </Card>
      ) : (
        <>
          <TodayCard sessions={training.sessions} routines={training.routines} today={today} style={{ animationDelay: "0.08s" }} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
            <Card className="p-4 animate-rise motion-reduce:animate-none lg:col-span-2" style={{ animationDelay: "0.08s" }}>
              <p className="px-2 text-lg font-semibold text-gray-900">{training.next.title}</p>
              <p className="mt-0.5 px-2 text-xs text-gray-500">{training.next.detail}</p>
              <BodyMap zones={training.zones} onSelect={setMuscle} className="mx-auto mt-3 h-72 w-full max-w-md" />
              <HeatLegend className="mt-2 justify-center" />
              <Zones zones={training.zones} today={today} onOpen={setMuscle} />
            </Card>

            <div className="space-y-4 lg:col-span-3">
              {training.lifts.length > 0 ? (
                <Card className="p-4 animate-rise motion-reduce:animate-none" style={{ animationDelay: "0.16s" }}>
                  <h2 className="px-2 text-sm font-medium text-gray-900">Cuánto levantas</h2>
                  <ul className="mt-1">
                    {training.lifts.map((l) => (
                      <li key={l.name}>
                        <LiftRow lift={l} onOpen={() => setOpen(l.name)} />
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <RoutinesCard routines={training.routines} style={{ animationDelay: "0.24s" }} />

              <SessionsCard sessions={training.sessions} today={today} style={{ animationDelay: "0.32s" }} />
            </div>
          </div>
        </>
      )}

      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.name} className="w-[min(92vw,26rem)]">
        {shown ? <LiftDetail lift={shown} /> : null}
      </Modal>
      <Modal open={zone !== undefined} onClose={() => setMuscle(null)} title={zone ? ZONE_LABEL[zone.zone] : undefined} className="w-[min(92vw,26rem)]">
        {zone ? <ZoneDetail zone={zone} /> : null}
      </Modal>
    </div>
  );
}

const sets = (n: number) => (n < 1 ? "<1" : String(Math.round(n)));

/** This week's sets, the most loaded muscle first; then the ones left behind. Untouched ones stay on the body only. */
function Zones({ zones, today, onOpen }: { zones: ZoneWeek[]; today: string; onOpen: (z: Zone) => void }) {
  const worked = zones.filter((z) => z.sets > 0).sort((a, b) => b.fatigue - a.fatigue || b.sets - a.sets);
  const left = zones.filter((z) => isForgotten(z, today));
  return (
    <>
      <h3 className="mt-4 px-2 text-xs font-medium text-gray-500">Series esta semana</h3>
      <ul className="mt-1 grid grid-cols-2 gap-x-4">
        {[...worked, ...left].map((z) => (
          <li key={z.zone}>
            <button type="button" onClick={() => onOpen(z.zone)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-gray-50">
              <Dot fill={zoneFill(z)} />
              <span className="truncate text-gray-900">{ZONE_LABEL[z.zone]}</span>
              <span className={cn("ml-auto text-xs whitespace-nowrap tabular-nums", z.sets > 0 ? "text-gray-500" : "text-amber-600")}>
                {z.sets > 0 ? sets(z.sets) : `hace ${daysBetween(z.last!, today)} d`}
              </span>
            </button>
          </li>
        ))}
        </ul>
    </>
  );
}

/** What gave this muscle its sets this week. */
function ZoneDetail({ zone }: { zone: ZoneWeek }) {
  return (
    <div className="space-y-3">
      {zone.from.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {zone.from.map((p) => (
            <li key={p.label} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-gray-900">{p.label}</span>
              <span className="text-gray-500 tabular-nums">{sets(p.sets)} series</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">{zone.last ? `Nada esta semana. La última vez, ${dayLabel(zone.last).toLowerCase()}.` : "Nada todavía."}</p>
      )}
      <p className="text-xs text-gray-500">Crece más con 10 series o más a la semana.</p>
    </div>
  );
}

const kg = (n: number) => `${Number(n.toFixed(1)).toLocaleString("es-ES")} kg`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${kg(Math.abs(n))}`;

function LiftRow({ lift, onOpen }: { lift: Lift; onOpen: () => void }) {
  const last = lift.points.at(-1)!;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{lift.name}</span>
      <Spark points={lift.points.map((p) => p.kg)} />
      <span className="text-sm whitespace-nowrap text-gray-900 tabular-nums">
        {kg(last.kg)}
        {last.reps ? <span className="text-gray-500"> ×{last.reps}</span> : null}
        {lift.change ? (
          <span className={cn("ml-2 text-xs", lift.change < 0 ? "text-amber-600" : "text-gray-500")}>{signed(lift.change)}</span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-gray-300" />
    </button>
  );
}

/** The heaviest set of each day as a line; nothing with one day. */
function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="hidden w-16 shrink-0 sm:block" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const y = (v: number) => (max === min ? 10 : 18 - ((v - min) / (max - min)) * 16);
  const line = points.map((v, i) => `${(i / (points.length - 1)) * 62 + 1},${y(v)}`).join(" ");
  return (
    <svg viewBox="0 0 64 20" className="hidden h-5 w-16 shrink-0 sm:block" aria-hidden>
      <polyline points={line} fill="none" className="stroke-gray-900" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LiftDetail({ lift }: { lift: Lift }) {
  return (
    <div className="space-y-3">
      {lift.move?.drawn ? <Move move={lift.move} size={200} className="mx-auto block" /> : null}
      {lift.move?.how ? <p className="text-sm text-gray-700">{lift.move.how}</p> : null}
      <p className="text-sm text-gray-500">
        {(Object.entries(lift.work) as [Zone, number][])
          .sort((a, b) => b[1] - a[1])
          .map(([z]) => ZONE_LABEL[z])
          .join(" · ")}
      </p>
      <ul className="divide-y divide-gray-100">
        {[...lift.points].reverse().map((p) => (
          <li key={p.day} className="flex items-baseline gap-3 py-2 text-sm">
            <span className="w-12 shrink-0 text-gray-500">{dayLabel(p.day)}</span>
            <span className="text-gray-900 tabular-nums">{p.sets}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
