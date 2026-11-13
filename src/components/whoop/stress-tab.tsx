import { localDay } from "~/lib/day";
import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import { level, LEVEL_LABEL, levelShares, stressSeries, type HrPoint, type Level, type StressPoint } from "~/lib/whoop/intraday";
import { LEVEL_BG, StressLine } from "./charts";
import { clock, Empty, Panel } from "./parts";

const LEVELS: Level[] = ["low", "mid", "high"];

/** The day's stress series, from the strap's minutes, with sleep and workouts left out. */
export function dayStress(days: Day[], day: string, hr: HrPoint[], maxHr: number | null): StressPoint[] {
  const d = days.find((x) => x.day === day);
  const rhr = d?.rhr ?? [...days].reverse().find((x) => x.rhr !== null && x.day <= day)?.rhr ?? null;
  if (rhr === null) return [];
  const skip = [
    ...days.flatMap((x) => (x.night ? [{ start: x.night.start, end: x.night.end }] : [])),
    ...(d?.workouts ?? []).map((w) => ({ start: w.start, end: w.end ?? w.start })),
  ];
  return stressSeries(
    hr.filter((p) => localDay(new Date(p.t)) === day),
    rhr,
    maxHr ?? 190,
    skip,
  );
}

/** WHOOP's Stress Monitor: the 0–3 gauge, the day's line, and the day against the rest of the week. */
export function StressTab({ days, day, hr, maxHr }: { days: Day[]; day: string; hr: HrPoint[]; maxHr: number | null }) {
  const points = dayStress(days, day, hr, maxHr);
  const d = days.find((x) => x.day === day);
  const now = points.at(-1)?.value ?? d?.stress ?? null;
  const others = [...new Set(hr.map((p) => localDay(new Date(p.t))))].filter((x) => x !== day).flatMap((x) => dayStress(days, x, hr, maxHr));
  const spans = [
    ...(d?.night ? [{ start: d.night.start, end: d.night.end, kind: "sleep" as const }] : []),
    ...(d?.workouts ?? []).map((w) => ({ start: w.start, end: w.end ?? w.start, kind: "activity" as const })),
  ];
  return (
    <div className="space-y-3">
      <Panel className="flex flex-col items-center py-6">
        <Gauge value={now} />
        <p className={cn("-mt-2 text-sm font-semibold", now !== null && now >= 2 ? "text-amber-600" : "text-gray-700")}>{now === null ? "Sin datos" : LEVEL_LABEL[level(now)]}</p>
        {points.length ? <p className="text-[11px] text-gray-400">Actualizado {clock(points.at(-1)!.t)}</p> : null}
      </Panel>
      <Panel title="A lo largo del día">
        {points.length > 2 ? (
          <>
            <StressLine points={points} spans={spans} />
            <p className="mt-1 flex gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-gray-100" />sueño</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-50" />actividad</span>
            </p>
          </>
        ) : (
          <Empty>El estrés minuto a minuto sale del pulso que manda Edge.</Empty>
        )}
      </Panel>
      {points.length > 2 ? (
        <Panel title="Día completo" right={<span className="text-[10px] text-gray-400">hoy frente a tu semana</span>}>
          {[
            { label: "Hoy", shares: levelShares(points) },
            ...(others.length ? [{ label: "Semana", shares: levelShares(others) }] : []),
          ].map((row) => (
            <div key={row.label} className="mb-2 flex items-center gap-3">
              <span className="w-14 text-xs text-gray-500">{row.label}</span>
              <span className="flex h-3 flex-1 overflow-hidden rounded-full">
                {LEVELS.map((l) => (
                  <span key={l} className={LEVEL_BG[l]} style={{ width: `${row.shares[l] * 100}%` }} />
                ))}
              </span>
            </div>
          ))}
          <p className="mt-2 flex gap-3 text-[10px] text-gray-500">
            {LEVELS.map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span className={cn("size-2 rounded-sm", LEVEL_BG[l])} />
                {LEVEL_LABEL[l]}
              </span>
            ))}
          </p>
        </Panel>
      ) : null}
      <p className="px-1 text-[11px] text-gray-400">WHOOP lo mide con pulso y variabilidad; aquí sale del pulso sobre tu reposo, sin entrenos ni sueño.</p>
    </div>
  );
}

/** A half circle 0–3: grey, darker grey, amber, and a needle. */
function Gauge({ value }: { value: number | null }) {
  const a = (v: number) => Math.PI * (1 - v / 3);
  const pt = (v: number, r: number) => `${60 + r * Math.cos(a(v))},${60 - r * Math.sin(a(v))}`;
  const seg = (from: number, to: number, cls: string) => <path d={`M${pt(from, 48)} A48 48 0 0 1 ${pt(to, 48)}`} fill="none" strokeWidth="8" className={cls} />;
  return (
    <svg viewBox="0 0 120 70" className="w-48">
      {seg(0, 0.98, "stroke-gray-300")}
      {seg(1.02, 1.98, "stroke-gray-600")}
      {seg(2.02, 3, "stroke-amber-500")}
      {value !== null ? (
        <>
          <line x1="60" y1="60" x2={pt(value, 40).split(",")[0]} y2={pt(value, 40).split(",")[1]} strokeWidth="2.5" strokeLinecap="round" className="stroke-gray-900" />
          <circle cx="60" cy="60" r="3.5" className="fill-gray-900" />
        </>
      ) : null}
      <text x="60" y="45" textAnchor="middle" className="fill-gray-900 text-[15px] font-bold tabular-nums">
        {value === null ? "–" : value.toFixed(1)}
      </text>
    </svg>
  );
}
