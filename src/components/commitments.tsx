"use client";

import type { CSSProperties } from "react";
import { Camera, Check, Flame, Moon } from "lucide-react";

import { weekdayLetter } from "~/lib/day";
import { cn } from "~/lib/utils";
import { amount, describeParts, hhmm, kindOf, type DayMark, type Standing, type Status } from "~/server/commitments/standing";
import { Render, Tip, useTick } from "./tick";

/**
 * One commitment whole, for the modal «Esta semana» opens: a ring that draws
 * itself to where he is (the small mark is where the pace says he should be
 * tonight) and the week as seven dots, Monday to Sunday. A dot is ticked by
 * tapping it, unless the data fills it on its own or it asks for a photo. Ink
 * when it goes well, amber when it needs him.
 */
const at = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

const CHIP: Record<Status, string> = {
  done: "Cumplido",
  "on-pace": "Vas bien",
  behind: "Por detrás",
  tight: "Cada día",
  pending: "Hoy",
};

export const needs = (s: Standing) => s.status === "behind" || s.status === "tight" || s.status === "pending";

/** The whole of one commitment, for its modal: the ring, the week, and how it gets done. */
export function CommitmentCard({ s, today, delay = 0 }: { s: Standing; today: string; delay?: number }) {
  const { title, metric, target, period, proof, activities } = s.commitment;
  const amber = needs(s);
  const area = activities[0] ?? "habit";
  const kind = s.members?.[0]?.kind ?? kindOf(s.commitment);
  const daily = period === "day";
  const bed = metric === "bedtime";
  const how = s.members?.length
    ? s.members.map((m) => m.name).join(" · ")
    : bed
      ? "Lo mide el WHOOP"
      : metric === "liters"
        ? "Se cuenta con lo que le dices al chat que bebes"
        : proof === "auto" ? "Se cuenta solo" : "Lo marcas tú";
  const line = bed
    ? describeParts(s).detail.replace(/^./, (ch) => ch.toUpperCase())
    : s.status === "done"
      ? daily
        ? "Hecho hoy"
        : "Semana cumplida"
      : daily && s.commitment.target === 1
        ? "Pendiente hoy"
        : `${s.left === 1 ? "Falta" : "Faltan"} ${amount(s.left, metric)}${daily ? " hoy" : s.daysLeft === 1 ? ", queda hoy" : `, quedan ${s.daysLeft} días`}`;
  return (
    <div>
      <div className="flex items-center gap-4">
        <Ring
          // A cap: the ring is the nights this week he kept it, of those already slept.
          done={s.done}
          target={bed ? Math.max(s.days.filter((d) => d.by === "auto").length, 1) : target}
          label={bed ? hhmm(target) : null}
          pace={daily ? null : s.pace}
          amber={amber}
          delay={delay + 0.2}
          metric={metric}
          // Once a day is done or not: nothing to count, the render says what it is.
          render={daily && target === 1 ? { area, title, kind } : null}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                s.status === "done"
                  ? "bg-gray-900 text-white"
                  : amber
                    ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    : "bg-gray-100 text-gray-600",
              )}
            >
              {bed ? (s.status === "behind" ? "Anoche tarde" : "Vas bien") : CHIP[s.status]}
            </span>
            {s.streak > 1 ? (
              <span className="flex items-center gap-0.5 text-xs font-medium tabular-nums text-amber-600">
                <Flame className="size-3.5" />
                {s.streak} {bed ? "noches" : "días"} seguidos
              </span>
            ) : null}
          </div>
          <p className="text-sm text-gray-700">{line}</p>
          <p className="text-xs text-gray-500">{how}</p>
        </div>
        {!(daily && target === 1) ? <Render area={area} title={title} kind={kind} size={72} className="-my-3" /> : null}
      </div>
      {metric === "sessions" || bed ? <Dots s={s} today={today} delay={delay + 0.3} /> : <Bars s={s} today={today} delay={delay + 0.3} />}
    </div>
  );
}

const R = 40;
const LEN = 2 * Math.PI * R;

function Ring({
  done,
  target,
  pace,
  amber,
  delay,
  metric,
  render,
  label,
}: {
  render: { area: string; title: string; kind: string | null } | null;
  label: string | null;
  done: number;
  target: number;
  pace: number | null;
  amber: boolean;
  delay: number;
  metric: Standing["commitment"]["metric"];
}) {
  const fill = Math.min(done / target, 1);
  // The pace mark, on the circle at the fraction he should have by tonight.
  const a = Math.min((pace ?? 0) / target, 1) * 2 * Math.PI - Math.PI / 2;
  const mark = (r: number) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const;
  const [x1, y1] = mark(R - 7);
  const [x2, y2] = mark(R + 7);
  const shown = amount(Math.round(done * 10) / 10, "sessions");
  return (
    <Tip text={label ? `Tope: ${label}` : pace !== null && fill < 1 ? `Para ir al día: ${amount(metric === "sessions" ? Math.round(pace) : pace, metric)} esta noche` : `${amount(done, metric)} de ${amount(target, metric)}`}>
      <div className="relative size-20 shrink-0">
        <svg viewBox="0 0 100 100" className="size-20">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="8" className="stroke-gray-100" />
          {fill > 0 ? (
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              strokeDasharray={LEN}
              strokeDashoffset={LEN * (1 - fill)}
              className={cn("animate-draw motion-reduce:animate-none", amber ? "stroke-amber-500" : "stroke-gray-900")}
              style={{ ["--len" as string]: LEN, animationDelay: `${delay}s` }}
            />
          ) : null}
          {pace !== null && fill < 1 ? (
            <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="2.5" strokeLinecap="round" className="stroke-gray-400" />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          {label ? (
            <>
              <span className="text-base font-semibold tabular-nums text-gray-900">{label}</span>
              <span className="mt-0.5 text-[10px] text-gray-400">tope</span>
            </>
          ) : fill >= 1 ? (
            <Check className="size-7 text-gray-900 animate-pop motion-reduce:animate-none" style={at(delay + 0.8)} strokeWidth={3} />
          ) : render ? (
            <Render area={render.area} title={render.title} kind={render.kind} size={60} />
          ) : (
            <>
              <span className={cn("font-semibold tabular-nums text-gray-900", shown.length > 3 ? "text-base" : "text-2xl")}>{shown}</span>
              <span className="mt-0.5 text-[10px] tabular-nums text-gray-400">/ {amount(target, metric)}</span>
            </>
          )}
        </div>
      </div>
    </Tip>
  );
}

const DAY = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });
const dayName = (day: string) => DAY.format(new Date(`${day}T12:00:00Z`));

/** Sessions and habits: one dot a day, Monday to Sunday. */
function Dots({ s, today, delay }: { s: Standing; today: string; delay: number }) {
  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5" onClick={(e) => e.stopPropagation()}>
      {s.days.map((d, i) => (
        <Dot key={d.day} s={s} d={d} today={today} delay={delay + i * 0.05} />
      ))}
    </div>
  );
}

function Dot({ s, d, today, delay }: { s: Standing; d: DayMark; today: string; delay: number }) {
  const key = `commitment-${s.commitment.id}`;
  const { on, toggle } = useTick(d.day, key, d.by === "check" || d.by === "photo");
  const future = d.day > today;
  const isToday = d.day === today;
  const bed = s.commitment.metric === "bedtime";
  // A night past the cap is marked, in amber: it happened, it just did not count.
  const late = bed && d.by === "auto" && d.value === 0;
  const filled = (d.by === "auto" && !late) || on;
  // A day the data or a photo filled is not his to untick.
  const canTick = !future && s.tickable && d.by !== "auto" && d.by !== "photo";
  const tip = future
    ? dayName(d.day)
    : bed
      ? `${dayName(d.day)} · ${d.clock === undefined ? (isToday ? "esta noche" : "sin datos") : `a la cama ${hhmm(d.clock)}`}`
      : d.by === "auto"
      ? `${dayName(d.day)} · ${d.value > 1 ? `${d.value} sesiones` : "registrado"}`
      : d.by === "photo"
        ? `${dayName(d.day)} · con foto`
        : on
          ? `${dayName(d.day)} · marcado`
          : canTick
            ? `${dayName(d.day)} · tócalo si lo hiciste`
            : dayName(d.day);
  const circle = (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-full transition-colors",
        filled
          ? "bg-gray-900 text-white"
          : late
            ? "border-2 border-amber-400 bg-amber-50 text-amber-600"
            : future
            ? "border-2 border-dashed border-gray-200"
            : isToday && needs(s)
              ? "border-2 border-amber-400 animate-pulse motion-reduce:animate-none"
              : "border-2 border-gray-200",
        canTick && !filled && "hover:border-gray-900",
      )}
    >
      {bed && d.by === "auto" ? (
        <Moon className="size-3.5" />
      ) : d.by === "photo" ? (
        <Camera className="size-3.5" />
      ) : on ? (
        <Check className="size-4 animate-pop motion-reduce:animate-none" strokeWidth={3} />
      ) : d.by === "auto" && d.value > 1 ? (
        <span className="text-[10px] font-semibold">×{d.value}</span>
      ) : null}
    </span>
  );
  return (
    <div className="flex flex-col items-center gap-1 animate-pop motion-reduce:animate-none" style={at(delay)}>
      <Tip text={tip}>
        {canTick ? (
          <button type="button" onClick={toggle} aria-label={tip}>
            {circle}
          </button>
        ) : (
          circle
        )}
      </Tip>
      <span className={cn("text-[10px]", isToday ? "font-semibold text-gray-900" : "text-gray-400")}>
        {weekdayLetter(d.day).toUpperCase()}
      </span>
    </div>
  );
}

/** Kilometres and minutes: a bar a day, scaled to the best day; the number on hover. */
function Bars({ s, today, delay }: { s: Standing; today: string; delay: number }) {
  const { metric } = s.commitment;
  const top = Math.max(...s.days.map((d) => d.value), 1);
  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5">
      {s.days.map((d, i) => (
        <div key={d.day} className="flex flex-col items-center gap-1">
          <Tip text={`${dayName(d.day)} · ${d.value > 0 ? amount(d.value, metric) : "nada"}`} className="w-full">
            <div className="flex h-12 w-full items-end">
              {d.value > 0 ? (
                <div
                  className={cn(
                    "w-full origin-bottom rounded animate-grow motion-reduce:animate-none",
                    d.day === today ? "bg-gray-900" : "bg-gray-600",
                  )}
                  style={{ height: `${Math.max((d.value / top) * 100, 12)}%`, ...at(delay + i * 0.05) }}
                />
              ) : (
                <div className={cn("h-1 w-full rounded", d.day > today ? "bg-gray-50" : "bg-gray-100")} />
              )}
            </div>
          </Tip>
          <span className={cn("text-[10px]", d.day === today ? "font-semibold text-gray-900" : "text-gray-400")}>
            {weekdayLetter(d.day).toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function range(from: string, to: string): string {
  const f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f.format(new Date(`${from}T12:00:00Z`))} al ${f.format(new Date(`${to}T12:00:00Z`))}`;
}
