"use client";

import { useState } from "react";

import { addDays, localMinutes } from "~/lib/day";
import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import type { HrPoint, Segment, Stage } from "~/lib/whoop/intraday";
import { bedtimePlan, SLEEP_GOALS, type SleepGoal } from "~/lib/whoop/plan";
import { compare, typicalStage, type MetricKey } from "~/lib/whoop/stats";
import { HrLine, Hypnogram, STAGE_LABEL, STAGE_TONE } from "./charts";
import { Arrow, clock, Empty, hmm, Label, MetricRow, Panel, Ring, Segmented } from "./parts";

/** WHOOP's three steps on each sleep contributor: optimal, sufficient, poor. */
const STEPS: Partial<Record<MetricKey, [number, number]>> = { hoursVsNeed: [85, 70], consistency: [80, 70], efficiency: [90, 80] };
const STAGES: { stage: Stage; key: "awakeMin" | "lightMin" | "deepMin" | "remMin" }[] = [
  { stage: "awake", key: "awakeMin" },
  { stage: "light", key: "lightMin" },
  { stage: "deep", key: "deepMin" },
  { stage: "rem", key: "remMin" },
];
const time = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

export function SleepTab({ days, day, hr, hypnogram, onTrend }: { days: Day[]; day: string; hr: HrPoint[]; hypnogram: Segment[]; onTrend: (k: MetricKey) => void }) {
  const d = days.find((x) => x.day === day);
  const n = d?.night ?? null;
  const p = n?.performance ?? null;
  if (!n) {
    return (
      <Panel>
        <Empty>No hay noche registrada para este día.</Empty>
      </Panel>
    );
  }
  const around = hr.filter((x) => x.t >= n.start - 30 * 60_000 && x.t <= n.end + 30 * 60_000);
  const segs = hypnogram.filter((s) => s.start >= n.start - 60 * 60_000 && s.end <= n.end + 60 * 60_000);
  const hours = compare(days, "sleepHours", day);
  const rest = compare(days, "restorativeHours", day);
  return (
    <div className="space-y-3">
      <Panel className="flex flex-col items-center gap-2 py-6">
        <Ring share={p === null ? null : p / 100} tone="text-gray-700" size={168}>
          <span className="text-4xl font-bold tabular-nums">{p === null ? "–" : `${p}%`}</span>
          <Label>Rendimiento</Label>
        </Ring>
        {n.edge ? <p className="text-[11px] text-gray-400">Medido por la correa con Edge; el rendimiento lo calcula health.</p> : null}
      </Panel>

      <Panel title="Lo que lo forma">
        <div className="divide-y divide-gray-100">
          {(["hoursVsNeed", "consistency", "efficiency"] as const).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <div className="flex-1">
                <MetricRow days={days} day={day} metric={k} onOpen={onTrend} />
              </div>
              <Steps value={compare(days, k, day).value} cut={STEPS[k]!} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Horas de sueño" right={<span className="text-[10px] text-gray-400">frente a 30 días</span>}>
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{hmm(n.sleepMin)}</span>
          <Arrow {...hours} />
          <span className="text-sm tabular-nums text-gray-400">{hmm(hours.avg === null ? null : hours.avg * 60)}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Necesitabas {hmm(n.neededMin)}
          {n.debtMin ? ` · ${hmm(n.debtMin)} de deuda` : ""} · {clock(n.start)} → {clock(n.end)}
        </p>
        <div className="mt-3">
          {around.length > 30 ? (
            <HrLine points={around} lines={[{ t: n.start, label: clock(n.start) }, { t: n.end, label: clock(n.end) }]} />
          ) : (
            <Empty>El pulso de la noche llega con Edge.</Empty>
          )}
        </div>
        {segs.length > 0 ? <Hypnogram segments={segs} /> : null}
      </Panel>

      <Panel title="Fases" right={<span className="text-xs tabular-nums text-gray-500">en cama {hmm(n.inBedMin)}</span>}>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] text-gray-400">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-gray-500" /> tu rango típico (30 días)
        </p>
        <ul className="space-y-3">
          {STAGES.map(({ stage, key }) => {
            const pct = n.inBedMin ? (n[key] / n.inBedMin) * 100 : 0;
            const typ = typicalStage(days, day, key);
            return (
              <li key={stage}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-gray-800">
                    {STAGE_LABEL[stage]} <span className="font-normal tabular-nums text-gray-500">{Math.round(pct)}%</span>
                  </span>
                  <span className="tabular-nums text-gray-600">{hmm(n[key])}</span>
                </div>
                <div className="relative h-3 rounded-full bg-[repeating-linear-gradient(135deg,theme(colors.gray.100)_0_4px,theme(colors.gray.50)_4px_8px)]">
                  <div className={cn("h-full rounded-full", STAGE_TONE[stage])} style={{ width: `${Math.min(100, pct)}%` }} />
                  {typ ? <div className="absolute -inset-y-0.5 rounded border border-dashed border-gray-500" style={{ left: `${typ[0]}%`, width: `${Math.max(1, typ[1] - typ[0])}%` }} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-800">Sueño reparador</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">{hmm(n.deepMin + n.remMin)}</span>
            <Arrow {...rest} />
            <span className="text-xs tabular-nums text-gray-400">{hmm(rest.avg === null ? null : rest.avg * 60)}</span>
          </span>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          {n.disturbances !== null ? `${n.disturbances} despertares · ` : ""}
          {n.cycles !== null ? `${n.cycles} ciclos · ` : ""}
          {n.resp !== null ? `${n.resp.toFixed(1)} rpm` : ""}
        </p>
      </Panel>

      <Planner days={days} day={day} />
    </div>
  );
}

/** Three blocks, the lit one says where the value falls: poor (amber), sufficient, optimal. */
function Steps({ value, cut }: { value: number | null; cut: [number, number] }) {
  const at = value === null ? -1 : value >= cut[0] ? 2 : value >= cut[1] ? 1 : 0;
  return (
    <span className="flex w-16 gap-0.5" title={["Pobre", "Suficiente", "Óptimo"][at]}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i !== at ? "bg-gray-100" : i === 0 ? "bg-amber-500" : i === 1 ? "bg-gray-400" : "bg-gray-900")} />
      ))}
    </span>
  );
}

/** WHOOP's Sleep Planner: the week's time in bed as floating bars, and when to go to bed tonight. */
function Planner({ days, day }: { days: Day[]; day: string }) {
  const [goal, setGoal] = useState<SleepGoal>(100);
  const plan = bedtimePlan(days, day, goal);
  const week = Array.from({ length: 7 }, (_, i) => days.find((d) => d.day === addDays(day, i - 6)) ?? null);
  // Clock minutes from 20:00, so a 23:30 bedtime and a 07:00 wake sit on one axis.
  const pos = (ms: number) => (localMinutes(new Date(ms)) - 20 * 60 + 1440) % 1440;
  const span = 14 * 60;
  return (
    <Panel title="Planificador de sueño">
      <div className="flex h-36 items-stretch gap-1.5">
        {week.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center">
            <div className="relative w-full flex-1 rounded bg-gray-50">
              {d?.night ? (
                <div
                  className="absolute inset-x-1 rounded bg-gray-400"
                  style={{ top: `${(pos(d.night.start) / span) * 100}%`, height: `${(Math.min(span, pos(d.night.end)) - pos(d.night.start)) / span * 100}%` }}
                  title={`${clock(d.night.start)} → ${clock(d.night.end)}`}
                />
              ) : null}
            </div>
            <span className="mt-1 text-[10px] tabular-nums text-gray-400">{addDays(day, i - 6).slice(8)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500">Mañana quiero</span>
        <Segmented options={SLEEP_GOALS.map((g) => ({ key: String(g.key) as `${SleepGoal}`, label: g.label }))} value={String(goal) as `${SleepGoal}`} onChange={(v) => setGoal(Number(v) as SleepGoal)} />
      </div>
      {plan ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["A la cama", time(plan.bed)],
            ["En cama", hmm(plan.inBedMin)],
            ["Despertar", time(plan.wake)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 py-2">
              <p className="text-lg font-semibold tabular-nums">{v}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">{k}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
