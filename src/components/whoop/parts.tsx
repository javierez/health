import type { CSSProperties, ReactNode } from "react";

import { localClock } from "~/lib/day";
import { cn } from "~/lib/utils";
import { compare, METRICS, zone, type MetricKey } from "~/lib/whoop/stats";
import type { Day } from "~/lib/whoop/days";

/**
 * The pieces every WHOOP screen is built from, in health's colours: grey for
 * what is fine, amber for what needs looking at. Where WHOOP paints green, a
 * dark grey; where it paints orange or red, amber.
 */
export const RECOVERY_TONE = { high: "text-gray-900", mid: "text-gray-500", low: "text-amber-500" } as const;
export const recoveryTone = (r: number | null) => (r === null ? "text-gray-300" : RECOVERY_TONE[zone(r)]);

/** `7:42` — WHOOP writes durations as h:mm. */
export function hmm(minutes: number | null | undefined): string {
  if (minutes == null) return "–";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** A metric's value the way WHOOP prints it. */
export function show(key: MetricKey, v: number | null): string {
  if (v === null) return "–";
  const unit = METRICS[key].unit;
  if (unit === "h") return hmm(v * 60);
  if (key === "strain" || key === "resp" || key === "stress") return v.toFixed(1);
  if (key === "skinTemp") return v.toFixed(1);
  if (key === "steps" || key === "kcal") return Math.round(v).toLocaleString("es-ES");
  return String(Math.round(v));
}

const R = 42;
const C = 2 * Math.PI * R;
const arc = (from: number, to: number) => ({ strokeDasharray: `${Math.max(0, to - from) * C} ${C}`, strokeDashoffset: -from * C });

/** A thin ring with a round cap, WHOOP's dial. `band` is a target arc behind it, `tick` a mark on it, both 0–1. */
export function Ring({
  share,
  tone,
  size = 112,
  band,
  tick,
  children,
}: {
  share: number | null;
  tone: string;
  size?: number;
  band?: [number, number];
  tick?: number;
  children: ReactNode;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="7" className="stroke-gray-200" />
        {band ? <circle cx="50" cy="50" r={R} fill="none" strokeWidth="7" className="stroke-gray-300" style={arc(band[0], band[1])} /> : null}
        {share !== null && share > 0 ? (
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="7" strokeLinecap="round" stroke="currentColor" className={cn(tone, "transition-[stroke-dasharray] duration-700")} style={arc(0, Math.min(1, share))} />
        ) : null}
        {tick !== undefined ? (
          <line x1="50" y1="3" x2="50" y2="13" strokeWidth="2" className="stroke-gray-900" transform={`rotate(${tick * 360} 50 50)`} />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Small caps label, WHOOP's section header. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500", className)}>{children}</p>;
}

/** ▲ / ▼ against the 30 days before: dark when better, amber when worse, nothing when level. */
export function Arrow({ value, avg, better }: { value: number | null; avg: number | null; better: boolean | null }) {
  if (value === null || avg === null || better === null) return null;
  return <span className={cn("text-[10px]", better ? "text-gray-900" : "text-amber-600")}>{value > avg ? "▲" : "▼"}</span>;
}

/** A metric row: name on the left, today with its arrow on the right, the 30-day average under it. */
export function MetricRow({ days, day, metric, onOpen }: { days: Day[]; day: string; metric: MetricKey; onOpen?: (k: MetricKey) => void }) {
  const c = compare(days, metric, day);
  const unit = METRICS[metric].unit;
  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(metric) : undefined}
      disabled={!onOpen}
      className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-default"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-700">{METRICS[metric].label}</span>
      <span className="text-right">
        <span className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums text-gray-900">
          {show(metric, c.value)}
          {unit && unit !== "h" && c.value !== null ? <span className="text-xs font-normal text-gray-500">{unit}</span> : null}
          <Arrow {...c} />
        </span>
        <span className="block text-xs tabular-nums text-gray-400">{show(metric, c.avg)}</span>
      </span>
    </button>
  );
}

/** W / M / 6M and the like. */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn("rounded-full px-3 py-1 text-xs font-medium", value === o.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A white card with WHOOP's caps title. */
export function Panel({ title, right, children, className, style }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cn("rounded-xl bg-white p-4 animate-rise motion-reduce:animate-none", className)} style={style}>
      {title || right ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title ? <Label>{title}</Label> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A grey line: nothing measured yet, and where it will come from. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}

export const clock = (ms: number) => localClock(new Date(ms));
