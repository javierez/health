"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import { Modal } from "~/components/ui/modal";
import { cn } from "~/lib/utils";
import { PARTNER, howFar, labNumber, meaningOf, outBefore, rangeText, type Labs, type Marker, type Point } from "~/lib/labs";
import { LabEvolution, short } from "./labs-evolution";

const arrow = (p: Point) => (p.out === "high" ? " ↑" : p.out === "low" ? " ↓" : "");

/** «el 17 mar (1,3 ↑) y el 28 mar (1,21 ↑)». */
function when(points: Point[], year: string) {
  const each = points.map((p) => `el ${short(p.day, year)} (${p.text}${arrow(p)})`);
  return each.length > 1 ? `${each.slice(0, -1).join(", ")} y ${each.at(-1)}` : each[0];
}

/**
 * His blood tests, read for him (Javier, 15-nov-2026: «difficult to see and
 * interpret… if too much info add it in info icons that open modals… its only
 * important about the LATEST analysis… and specially if they've been wrong
 * before… how can we simplify even more»). One line per value out in the
 * latest test, «otra vez» if it was out before too, those first, with its
 * line when it has more than one test («I want the graph, but not the rest
 * of the values»). Its range, meaning and partner live behind the tap.
 */
export function LabsCard({ labs }: { labs: Labs }) {
  const [info, setInfo] = useState<string | null>(null);
  if (labs.tests.length === 0) return null;
  const all = labs.panels.flatMap((p) => p.markers);
  const byName = new Map(all.map((m) => [m.marker, m]));
  const about = info ? byName.get(info) : undefined;
  const last = labs.tests.at(-1)!;
  const year = last.day.slice(0, 4);
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Analíticas</h2>
        <p className="text-xs text-gray-400">
          {short(last.day, year)} · {labs.now.length > 0 ? `${labs.now.length} fuera de rango` : last.lab}
        </p>
      </div>

      {labs.now.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Todo en rango.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {labs.now.map((m) => {
            const x = m.points.at(-1)!;
            return (
              <li key={m.marker}>
                <button type="button" onClick={() => setInfo(m.marker)} className="flex w-full items-baseline gap-2 rounded-md py-2 text-left hover:bg-gray-50">
                  <span className="text-sm text-gray-900">{m.marker}</span>
                  {outBefore(m).length > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">otra vez</span> : null}
                  <span className="ml-auto text-sm font-semibold text-amber-700 tabular-nums">
                    {x.text}
                    {arrow(x)}
                  </span>
                  <Info className="size-3.5 self-center text-gray-300" aria-hidden />
                </button>
                <div className="pb-2">
                  <LabEvolution m={m} year={year} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={about !== undefined} onClose={() => setInfo(null)} title={about?.marker} className="w-[min(92vw,34rem)]">
        {about ? <About m={about} partner={byName.get(PARTNER[about.marker] ?? "")} year={year} /> : null}
      </Modal>
    </section>
  );
}

function Name({ m, onInfo }: { m: Marker; onInfo: () => void }) {
  return (
    <button type="button" onClick={onInfo} className="group flex items-center gap-1 text-left text-sm font-medium text-gray-900">
      {m.marker}
      <Info className="size-3.5 text-gray-300 transition-colors group-hover:text-gray-600" aria-label="Qué es" />
    </button>
  );
}

/** Behind the ⓘ: what it measures, its range, the last value and how far, its partner, its line. */
function About({ m, partner, year }: { m: Marker; partner?: Marker; year: string }) {
  const nums = m.points.filter((p) => p.value !== null);
  const last = m.points.at(-1)!;
  const ranged = [...m.points].reverse().find((p) => p.low !== null || p.high !== null);
  const mate = partner?.points.at(-1);
  const meaning = meaningOf(m.marker);
  return (
    <div className="space-y-3 text-sm">
      {meaning ? <p className="leading-relaxed text-gray-700">{meaning}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-gray-500">
        <dt>Último</dt>
        <dd className={cn("font-medium tabular-nums", last.out ? "text-amber-700" : "text-gray-900")}>
          {last.text}
          {arrow(last)}
          {m.unit ? ` ${m.unit}` : ""}, {short(last.day, year)}
          {last.out ? <span className="font-normal"> · {howFar(last)}</span> : null}
        </dd>
        {outBefore(m).length > 0 ? (
          <>
            <dt>Antes</dt>
            <dd className="text-gray-900">También fuera {when(outBefore(m), year)}</dd>
          </>
        ) : null}
        {ranged ? (
          <>
            <dt>Lo normal</dt>
            <dd className="text-gray-900 tabular-nums">{rangeText(ranged.low, ranged.high)}</dd>
          </>
        ) : null}
        {partner && mate ? (
          <>
            <dt>Con {partner.marker}</dt>
            <dd className={cn("tabular-nums", mate.out ? "font-medium text-amber-700" : "text-gray-900")}>
              {mate.text}
              {arrow(mate)}, {mate.out ? "fuera de rango" : "en rango"}
            </dd>
          </>
        ) : null}
      </dl>
      {nums.length >= 2 ? <LabEvolution m={m} year={year} /> : ranged && last.value !== null ? <RangeBar p={last} /> : null}
      <p className="text-xs text-gray-400">Qué mide cada uno, para leerlo; lo que significa para ti lo dice tu médico.</p>
    </div>
  );
}

/** Where the value falls: the range in grey, his value a dot, amber when out. */
function RangeBar({ p }: { p: Point }) {
  const low = p.low ?? 0;
  const high = p.high ?? low;
  const pad = (high - low) * 0.35 || 1;
  const from = Math.min(low === 0 ? 0 : low - pad, p.value!);
  const to = Math.max(high + pad, p.value!);
  const at = (v: number) => `${((v - from) / (to - from)) * 100}%`;
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-gray-50">
        <span className="absolute inset-y-0 rounded-full bg-gray-200" style={{ left: at(low), right: `calc(100% - ${at(high)})` }} />
        <span className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white", p.out ? "bg-amber-500" : "bg-gray-900")} style={{ left: at(p.value!) }} />
      </div>
      <div className="relative mt-1 h-3 text-[10px] text-gray-400 tabular-nums">
        {p.low !== null && p.low !== 0 ? (
          <span className="absolute -translate-x-1/2" style={{ left: at(low) }}>
            {labNumber(low)}
          </span>
        ) : null}
        <span className="absolute -translate-x-1/2" style={{ left: at(high) }}>
          {labNumber(high)}
        </span>
      </div>
    </div>
  );
}
