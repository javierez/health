"use client";

import { useState, type CSSProperties } from "react";

import { dayLabel } from "~/components/balance-card";
import { MetalHeart } from "~/components/metal-heart";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { addDays, dayTitle, localClock } from "~/lib/day";
import { hours } from "~/lib/sessions";
import { cn } from "~/lib/utils";
import type { KindTimes, Training } from "~/server/training/summary";
import { Tile } from "./exercise-detail";
import { Move } from "./move";

const WEEKS = 53;
const COLOR = { pesas: "bg-gray-900", deporte: "bg-amber-500", otro: "bg-gray-300" } as const;

/** His year: one square a day, weights dark, a sport amber, a walk grey. */
export function YearCard({ year, today, style }: { year: Training["year"]; today: string; style?: CSSProperties }) {
  const kind = new Map(year.map((d) => [d.day, d.kind]));
  // Columns are weeks, Monday on top; the last one ends today.
  const lastMonday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const first = addDays(lastMonday, -(WEEKS - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(first, i)).filter((d) => d <= today);
  const gym = year.filter((d) => d.kind === "pesas").length;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <p className="flex items-baseline px-2">
        <span className="text-sm font-medium text-gray-900">Tu año</span>
        <span className="ml-auto text-xs text-gray-500 tabular-nums">
          {year.length} días entrenados · {gym} de pesas
        </span>
      </p>
      <div className="mt-3 overflow-x-auto px-2">
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ width: "max-content" }}>
          {days.map((d) => {
            const k = kind.get(d);
            return <span key={d} title={k ? dayLabel(d) : undefined} className={cn("size-[11px] rounded-[3px]", k ? COLOR[k] : "bg-gray-100", d === today && "ring-2 ring-amber-400")} />;
          })}
        </div>
      </div>
      <p className="mt-2 flex gap-3 px-2 text-[11px] text-gray-500">
        {(["pesas", "deporte", "otro"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("size-2 rounded-[2px]", COLOR[k])} />
            {k === "pesas" ? "Pesas" : k === "deporte" ? "Deporte" : "Andar, otros"}
          </span>
        ))}
      </p>
    </Card>
  );
}

/** «Lo que haces»: each sport with its drawing, still until hovered; a tap lists every time. */
export function KindsGrid({ kinds, today, style }: { kinds: KindTimes[]; today: string; style?: CSSProperties }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = kinds.find((k) => k.name === open);
  if (kinds.length === 0) return null;
  return (
    <section className="animate-rise motion-reduce:animate-none" style={style}>
      <h2 className="px-2 text-sm font-medium text-gray-900">Lo que haces</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kinds.map((k) => {
          const min = k.times.reduce((n, t) => n + (t.minutes ?? 0), 0);
          return (
            <button
              key={k.name}
              type="button"
              onClick={() => setOpen(k.name)}
              className="group flex flex-col items-center rounded-2xl bg-card p-3 shadow-md transition-colors hover:bg-gray-50"
            >
                {k.move?.drawn ? <Move move={k.move} size={150} still /> : <span className="h-[150px]" />}
                <span className="mt-2 text-sm font-medium text-gray-900">{k.name}</span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {k.times.length} {k.times.length === 1 ? "vez" : "veces"}
                  {min > 0 ? ` · ${hours(min)}` : ""}
                </span>
            </button>
          );
        })}
      </div>
      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.name} className="w-[min(92vw,30rem)]">
        {shown ? <KindDetail kind={shown} today={today} /> : null}
      </Modal>
    </section>
  );
}

function KindDetail({ kind, today }: { kind: KindTimes; today: string }) {
  const min = kind.times.reduce((n, t) => n + (t.minutes ?? 0), 0);
  const kcal = kind.times.reduce((n, t) => n + (t.kcal ?? 0), 0);
  const top = Math.max(0, ...kind.times.map((t) => t.maxHr ?? 0));
  return (
    <div className="space-y-4">
      {kind.move?.drawn ? (
        <div className="flex justify-center rounded-xl bg-gradient-to-b from-gray-50 to-white py-3">
          <Move move={kind.move} size={240} />
        </div>
      ) : null}
      {kind.move?.how ? <p className="text-sm text-gray-600">{kind.move.how}</p> : null}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Tile label="Tiempo" value={min > 0 ? hours(min) : "–"} />
        <Tile label="Calorías" value={kcal > 0 ? kcal.toLocaleString("es-ES") : "–"} />
        <Tile label="Pulso máx" value={top > 0 ? <><MetalHeart />{top}</> : "–"} />
      </dl>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-xs text-gray-400">
              <th className="pb-1 font-normal">Día</th>
              <th className="pb-1 font-normal">Min</th>
              <th className="pb-1 font-normal">Esfuerzo</th>
              <th className="pb-1 text-right font-normal">Pulso medio / máx</th>
            </tr>
          </thead>
          <tbody>
            {kind.times.map((t, i) => (
              <tr key={`${t.day}-${i}`} className="border-t border-gray-100 tabular-nums">
                <td className="py-2 text-gray-900">
                  {dayTitle(t.day, today)}
                  {t.day.slice(0, 4) !== today.slice(0, 4) ? ` ${t.day.slice(2, 4)}` : ""}
                  {t.start ? <span className="ml-1 text-xs text-gray-400">{localClock(t.start)}</span> : null}
                </td>
                <td className="py-2">{t.minutes ?? "–"}</td>
                <td className="py-2">{t.strain ?? "–"}</td>
                <td className="py-2 text-right">{t.avgHr ? `${t.avgHr} / ${t.maxHr ?? "–"}` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
