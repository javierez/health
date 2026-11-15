"use client";

import { useState, type ReactNode } from "react";

import { MetalHeart } from "~/components/metal-heart";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { dayLong, localClock } from "~/lib/day";
import { cn } from "~/lib/utils";
import { hours, titleOf } from "~/lib/sessions";
import { spiderOf, type PulseMinute, type Zones } from "~/lib/workout";
import type { WorkoutView } from "~/server/queries/training";
import type { Lift } from "~/server/training/summary";
import { ExerciseDetail } from "./exercise-detail";
import { otherDays, tons } from "./last-session";
import { Move } from "./move";
import { Spider } from "./spider";
import { BodyMap, Dot, SESSION_HEAT } from "./body-map";

const rise = (i: number) => ({ animationDelay: `${0.08 * i}s` });

/**
 * One session's own page, the link the chat sends when he is done (Javier,
 * 14-nov-2026: «una URL al acabar… verlo y darle una puntuación»): what it
 * took, the band's pulse minute by minute, each exercise with its drawing, and
 * Pulso's score with why. A tap on an exercise opens its sets.
 */
export function WorkoutPage({ view, lifts }: { view: WorkoutView; lifts: Lift[] }) {
  const { session: s, stats, score, pulse, zones } = view;
  const [open, setOpen] = useState<number | null>(null);
  const lines = s.lines.filter((l) => !l.sport || l.move?.drawn);
  const shown = open === null ? undefined : lines[open];
  return (
    <div className="space-y-4">
      <Card className="relative p-5 animate-rise motion-reduce:animate-none">
        {stats.avgHr ? <MetalHeart beat={stats.avgHr} className="absolute top-5 right-5 size-9" /> : null}
        <p className="text-sm text-gray-500 first-letter:uppercase">
          {dayLong(s.day)}
          {stats.range ? ` · ${stats.range.from} a ${stats.range.to}` : s.span ? ` · ${localClock(s.span.from)} a ${localClock(s.span.to)}` : ""}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{titleOf(s)}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-900">
          {stats.minutes ? <Chip>{hours(stats.minutes)}</Chip> : null}
          {stats.exercises > 0 ? (
            <Chip>
              {stats.exercises} {stats.exercises === 1 ? "ejercicio" : "ejercicios"} · {stats.sets} series
            </Chip>
          ) : null}
          {stats.moved > 0 ? <Chip>{tons(stats.moved)} movidas</Chip> : null}
          {stats.avgHr ? (
            <Chip>
              <MetalHeart />
              {stats.avgHr} de media, {stats.maxHr} máx
            </Chip>
          ) : null}
        </div>
        {pulse.length >= 2 ? <PulseChart pulse={pulse} zones={zones} /> : null}
      </Card>

      {lines.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((l, i) => (
            <button
              key={l.name}
              type="button"
              onClick={() => setOpen(i)}
              className="group rounded-2xl bg-card p-4 text-left shadow-md transition-colors animate-rise hover:bg-gray-50 motion-reduce:animate-none"
              style={rise(i % 6)}
            >
              <span className="flex justify-center rounded-xl bg-gradient-to-b from-gray-50 to-white py-2">
                {l.move?.drawn ? <Move move={l.move} size={220} still /> : <span className="h-[220px]" />}
              </span>
              <span className="mt-2 block text-sm font-medium text-gray-900">
                {i + 1}. {l.name}
              </span>
              {l.sets.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {l.sets.map((t, j) => (
                    <span key={j} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 tabular-nums">
                      {t}
                    </span>
                  ))}
                </span>
              ) : l.text ? (
                <span className="mt-1 block text-xs text-gray-500 tabular-nums">{l.text}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {s.muscles && Object.keys(s.muscles).length > 0 ? (
          <Card className="p-5 animate-rise motion-reduce:animate-none" style={rise(2)}>
            <h2 className="text-lg font-semibold text-gray-900">Qué trabajaste</h2>
            <p className="text-xs text-gray-500">Series por músculo; el que ayuda cuenta media.</p>
            <div className="mt-3 grid items-center gap-4 md:grid-cols-2">
              <div>
                <BodyMap sets={s.muscles} className="mx-auto h-64 w-full max-w-sm" />
                <p className="mt-2 flex justify-center gap-3 text-xs text-gray-500">
                  {SESSION_HEAT.map((h) => (
                    <span key={h.label} className="flex items-center gap-1">
                      <Dot fill={h.fill} />
                      {h.label}
                    </span>
                  ))}
                </p>
              </div>
              <Spider arms={spiderOf(s.muscles)} />
            </div>
          </Card>
        ) : null}
        <Card className="p-5 animate-rise motion-reduce:animate-none" style={rise(3)}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Nota de Pulso</h2>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {score.score}
              <span className="text-base font-medium text-gray-400">/10</span>
            </p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-900">
            {score.plus.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-emerald-600">+</span>
                {t}
              </li>
            ))}
            {score.minus.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-amber-600">−</span>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500">La pone Pulso al acabar, con lo que le contaste al chat y el pulso de la banda.</p>
        </Card>
      </div>

      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.name} className="w-[min(92vw,30rem)]">
        {shown ? <ExerciseDetail line={shown} other={otherDays(lifts, shown.name, s.day)} /> : null}
      </Modal>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 tabular-nums">{children}</span>;
}

/** Each zone a deeper amber, the same in the chart and in the bar. */
const ZONE_TINT = [0.12, 0.24, 0.4, 0.6, 0.85];
const tint = (z: number) => `rgb(245 158 11 / ${ZONE_TINT[z]})`;

/**
 * The band's pulse while it lasted, over his five zones (WHOOP's, from his
 * max pulse): each zone a band, deeper the harder, with where it starts on
 * the left and its name on the right; under it, the minutes in each. Shown
 * with «Zonas»; otherwise, and without his max pulse, a faint line every 20 beats.
 */
function PulseChart({ pulse, zones: all }: { pulse: PulseMinute[]; zones: Zones | null }) {
  // Hidden until he asks (Javier, 15-nov-2026: «toggleable… hidden by default»).
  const [show, setShow] = useState(false);
  const zones = show ? all : null;
  const W = 600;
  const H = 120;
  const lo = Math.min(...pulse.map((p) => p.avg)) - 5;
  const hi = Math.max(...pulse.map((p) => p.avg)) + 5;
  const x = (i: number) => (i / (pulse.length - 1)) * W;
  const y = (v: number) => H - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * H;
  const pct = (v: number) => `${(y(v) / H) * 100}%`;
  const line = pulse.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ");
  const bands = (zones?.from ?? [])
    .map((from, z) => ({ z, from, to: zones!.from[z + 1] ?? Infinity }))
    .filter((b) => b.to > lo && b.from < hi);
  const ticks: number[] = [];
  if (zones) ticks.push(...bands.map((b) => b.from).filter((v) => v > lo));
  else for (let v = Math.ceil(lo / 20) * 20; v <= hi; v += 20) ticks.push(v);
  const total = zones ? zones.minutes.reduce((n, m) => n + m, 0) : 0;
  return (
    <div className="mt-5">
      {all ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-pressed={show}
            className={cn("rounded-full px-3 py-1 text-xs transition-colors", show ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
          >
            Zonas
          </button>
        </div>
      ) : null}
      <div className="relative h-36 px-7">
        {ticks.map((v) => (
          <span key={v} className="absolute left-0 -translate-y-1/2 text-[11px] text-gray-400 tabular-nums" style={{ top: pct(v) }}>
            {v}
          </span>
        ))}
        {bands.filter((b) => y(Math.max(b.from, lo)) - y(Math.min(b.to, hi)) >= 14).map((b) => (
          <span key={b.z} className="absolute right-0 -translate-y-1/2 text-[11px] text-gray-400" style={{ top: `${((y(Math.min(b.to, hi)) + y(Math.max(b.from, lo))) / 2 / H) * 100}%` }}>
            Z{b.z + 1}
          </span>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full" aria-hidden>
          {bands.map((b) => (
            <rect key={b.z} x={0} width={W} y={y(Math.min(b.to, hi))} height={y(Math.max(b.from, lo)) - y(Math.min(b.to, hi))} fill={tint(b.z)} />
          ))}
          {zones ? null : ticks.map((v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} className="stroke-gray-100" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {zones ? null : <path d={`${line} L${W},${H} L0,${H}Z`} className="fill-amber-100/80" />}
          <path d={line} fill="none" className={zones ? "stroke-gray-900" : "stroke-amber-500"} strokeWidth={zones ? 1.5 : 2} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1 flex justify-between px-7 text-[11px] text-gray-400 tabular-nums">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{pulse[Math.round(f * (pulse.length - 1))]!.t}</span>
        ))}
      </div>
      {zones && total > 0 ? (
        <div className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
            {zones.minutes.map((m, z) => (m > 0 ? <span key={z} style={{ width: `${(m / total) * 100}%`, background: tint(z) }} /> : null))}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 tabular-nums">
            {zones.minutes.map((m, z) => (
              <span key={z} className={cn("flex items-center gap-1.5", m === 0 && "text-gray-300")}>
                <span className="size-2 rounded-full" style={{ background: tint(z) }} />
                <span className="font-medium text-gray-900">Z{z + 1}</span> {m} min
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </div>
  );
}
