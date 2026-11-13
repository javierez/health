import { localDay } from "~/lib/day";
import { sportName } from "~/lib/sports";
import { cn } from "~/lib/utils";
import type { Day, Workout } from "~/lib/whoop/days";
import type { HrPoint } from "~/lib/whoop/intraday";
import { strainBand, strainTarget, zone, type MetricKey } from "~/lib/whoop/stats";
import { HrLine } from "./charts";
import { clock, Empty, hmm, Label, MetricRow, Panel, recoveryTone, Ring } from "./parts";

const ZONE_LABEL = { high: "Alta", mid: "Media", low: "Baja" } as const;

/** WHOOP's Recovery: the big ring and what it is made of, each against the prior 30 days. */
export function RecoveryTab({ days, day, onTrend }: { days: Day[]; day: string; onTrend: (k: MetricKey) => void }) {
  const d = days.find((x) => x.day === day);
  const r = d?.recovery ?? null;
  return (
    <div className="space-y-3">
      <Panel className="flex flex-col items-center gap-2 py-6">
        <Ring share={r === null ? null : r / 100} tone={recoveryTone(r)} size={168}>
          <span className="text-4xl font-bold tabular-nums">{r === null ? "–" : `${Math.round(r)}%`}</span>
          <Label>Recuperación</Label>
        </Ring>
        {r !== null ? <p className={cn("text-sm font-medium", recoveryTone(r))}>{ZONE_LABEL[zone(r)]}</p> : null}
      </Panel>
      <Panel title="Lo que la forma" right={<span className="text-[10px] text-gray-400">▲▼ hoy frente a 30 días</span>}>
        <div className="divide-y divide-gray-100">
          {(["hrv", "rhr", "resp", "sleepPerf", "spo2", "skinTemp"] as const).map((k) => (
            <MetricRow key={k} days={days} day={day} metric={k} onOpen={onTrend} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Heart-rate zones 1–5: grey to amber, as WHOOP goes grey to orange. */
export const ZONE_TONE = ["bg-gray-100", "bg-gray-200", "bg-gray-300", "bg-gray-500", "bg-amber-300", "bg-amber-600"];

/** WHOOP's Strain: the 0–21 ring with today's target band, the zones, steps, and each activity. */
export function StrainTab({ days, day, hr, onTrend }: { days: Day[]; day: string; hr: HrPoint[]; onTrend: (k: MetricKey) => void }) {
  const d = days.find((x) => x.day === day);
  const s = d?.strain ?? null;
  const t = strainTarget(d?.recovery ?? null);
  const dayHr = hr.filter((p) => localDay(new Date(p.t)) === day);
  return (
    <div className="space-y-3">
      <Panel className="flex flex-col items-center gap-2 py-6">
        <Ring share={s === null ? null : s / 21} tone="text-gray-900" size={168} band={t ? [t.low / 21, t.high / 21] : undefined} tick={t ? t.optimal / 21 : undefined}>
          <span className="text-4xl font-bold tabular-nums">{s === null ? "–" : s.toFixed(1)}</span>
          <Label>Esfuerzo del día</Label>
        </Ring>
        <p className="text-sm text-gray-600">
          {s !== null ? strainBand(s) : ""}
          {t ? <span className="text-gray-400"> · objetivo {t.low}–{t.high}</span> : null}
        </p>
      </Panel>
      <Panel title="Lo que lo forma" right={<span className="text-[10px] text-gray-400">▲▼ hoy frente a 30 días</span>}>
        <div className="divide-y divide-gray-100">
          {(["z13", "z45", "strength", "steps", "kcal", "avgHr"] as const).map((k) => (
            <MetricRow key={k} days={days} day={day} metric={k} onOpen={onTrend} />
          ))}
        </div>
      </Panel>
      <Panel title="Pulso del día">{dayHr.length > 30 ? <HrLine points={dayHr} marks={d?.workouts.map((w) => [w.start, w.end ?? w.start] as [number, number])} /> : <Empty>El pulso minuto a minuto llega con Edge.</Empty>}</Panel>
      {d?.workouts.length ? (
        <Panel title="Actividades">
          <ul className="divide-y divide-gray-100">
            {d.workouts.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function WorkoutRow({ w }: { w: Workout }) {
  const total = w.zones.reduce((a, b) => a + b, 0);
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-gray-900">{sportName(w.sport)}</span>
        <span className="text-xs tabular-nums text-gray-500">
          {clock(w.start)}
          {w.end ? `–${clock(w.end)}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Esfuerzo", w.strain?.toFixed(1) ?? "–"],
          ["kcal", w.kcal?.toLocaleString("es-ES") ?? "–"],
          ["Pulso medio", w.avgHr ?? "–"],
          ["Máximo", w.maxHr ?? "–"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 py-1.5">
            <p className="text-sm font-semibold tabular-nums">{v}</p>
            <p className="text-[10px] text-gray-500">{k}</p>
          </div>
        ))}
      </div>
      {total > 0 ? (
        <div className="space-y-1">
          {w.zones.map((m, i) =>
            i === 0 ? null : (
              <div key={i} className="flex items-center gap-2 text-[11px] tabular-nums text-gray-500">
                <span className="w-12">Zona {i}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-50">
                  <span className={cn("block h-full rounded-full", ZONE_TONE[i])} style={{ width: `${(m / total) * 100}%` }} />
                </span>
                <span className="w-10 text-right">{hmm(m)}</span>
              </div>
            ),
          )}
        </div>
      ) : null}
    </li>
  );
}
