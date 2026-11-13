import type { ReactNode } from "react";
import { Check, Moon, TriangleAlert } from "lucide-react";

import { sportName } from "~/lib/sports";
import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import { bedtimePlan, weeklyPlan, type Goal } from "~/lib/whoop/plan";
import { personalRange, strainTarget, type MetricKey } from "~/lib/whoop/stats";
import { clock, hmm, Label, MetricRow, Panel, recoveryTone, Ring } from "./parts";
import type { Tab } from "./whoop-view";

/** WHOOP's dashboard rows, in its order. Each opens its trend. */
const DASHBOARD: MetricKey[] = ["hrv", "rhr", "resp", "sleepPerf", "efficiency", "consistency", "sleepHours", "restorative", "steps", "kcal", "avgHr", "z13", "z45"];
export const VITALS: MetricKey[] = ["resp", "spo2", "rhr", "hrv", "skinTemp"];
const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

export function HomeTab({ days, day, stress, onTab, onTrend }: { days: Day[]; day: string; stress: number | null; onTab: (t: Tab) => void; onTrend: (k: MetricKey) => void }) {
  const d = days.find((x) => x.day === day);
  const target = strainTarget(d?.recovery ?? null);
  const vitals = VITALS.map((k) => personalRange(days, k, day)).filter((r) => r?.within != null);
  const inRange = vitals.filter((r) => r!.within).length;
  const plan = weeklyPlan(days, day);
  const bed = bedtimePlan(days, day, 100);
  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex justify-around gap-2">
          {[
            { tab: "sleep" as const, label: "Sueño", ring: <Ring share={d?.night?.performance != null ? d.night.performance / 100 : null} tone="text-gray-700" size={96}><Big>{d?.night?.performance != null ? `${d.night.performance}%` : "–"}</Big></Ring> },
            { tab: "recovery" as const, label: "Recuperación", ring: <Ring share={d?.recovery != null ? d.recovery / 100 : null} tone={recoveryTone(d?.recovery ?? null)} size={96}><Big>{d?.recovery != null ? `${Math.round(d.recovery)}%` : "–"}</Big></Ring> },
            {
              tab: "strain" as const,
              label: "Esfuerzo",
              ring: (
                <Ring share={d?.strain != null ? d.strain / 21 : null} tone="text-gray-900" size={96} band={target ? [target.low / 21, target.high / 21] : undefined} tick={target ? target.optimal / 21 : undefined}>
                  <Big>{d?.strain != null ? d.strain.toFixed(1) : "–"}</Big>
                </Ring>
              ),
            },
          ].map((x) => (
            <button key={x.tab} type="button" onClick={() => onTab(x.tab)} className="flex flex-col items-center gap-1.5">
              {x.ring}
              <Label className="text-gray-700">{x.label} ›</Label>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onTab("health")} className="rounded-xl bg-white p-4 text-left">
          <Label>Monitor de salud</Label>
          <p className={cn("mt-2 flex items-center gap-1.5 text-sm font-semibold", inRange === vitals.length ? "text-gray-900" : "text-amber-600")}>
            {inRange === vitals.length ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
            {inRange === vitals.length ? "En tu rango" : "Fuera de rango"}
          </p>
          <p className="text-xs text-gray-500">{inRange}/{vitals.length} métricas</p>
        </button>
        <button type="button" onClick={() => onTab("stress")} className="rounded-xl bg-white p-4 text-left">
          <Label>Estrés</Label>
          <p className={cn("mt-2 text-sm font-semibold", stress !== null && stress >= 2 ? "text-amber-600" : "text-gray-900")}>
            {stress === null ? "–" : `${stress.toFixed(1)} · ${stress >= 2 ? "Alto" : stress >= 1 ? "Medio" : "Bajo"}`}
          </p>
          <p className="text-xs text-gray-500">de 0 a 3</p>
        </button>
      </div>

      <Panel title="Mi día">
        <ul className="divide-y divide-gray-100">
          {d?.night ? (
            <Activity pill={hmm(d.night.sleepMin)} name="Sueño" from={d.night.start} to={d.night.end} dark={false} />
          ) : null}
          {d?.workouts.map((w) => <Activity key={w.id} pill={w.strain?.toFixed(1) ?? "–"} name={sportName(w.sport)} from={w.start} to={w.end} dark />)}
          {!d?.night && !d?.workouts.length ? <li className="py-2 text-sm text-gray-500">Nada registrado este día.</li> : null}
        </ul>
        {bed ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-gray-700">
              <Moon className="size-4" />A la cama a las <b className="tabular-nums">{time(bed.bed)}</b>
            </span>
            <span className="text-xs tabular-nums text-gray-500">despertar {time(bed.wake)}</span>
          </div>
        ) : null}
      </Panel>

      <Panel title="Plan de la semana" right={<span className="text-sm font-semibold tabular-nums">{plan.accomplished}% hecho</span>}>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-900" style={{ width: `${plan.accomplished}%` }} />
        </div>
        <ul className="space-y-2">
          {plan.goals.map((g) => (
            <GoalRow key={g.label} goal={g} />
          ))}
        </ul>
      </Panel>

      <Panel title="Mi tablero" right={<span className="text-[10px] text-gray-400">hoy · media 30 días</span>}>
        <div className="divide-y divide-gray-100">
          {DASHBOARD.map((k) => (
            <MetricRow key={k} days={days} day={day} metric={k} onOpen={onTrend} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <span className="text-xl font-bold tabular-nums text-gray-900">{children}</span>;
}

function Activity({ pill, name, from, to, dark }: { pill: string; name: string; from: number; to: number | null; dark: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={cn("w-14 rounded-md py-1 text-center text-xs font-semibold tabular-nums", dark ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-800")}>{pill}</span>
      <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-gray-800">{name}</span>
      <span className="border-l border-gray-200 pl-2 text-right text-[11px] leading-tight tabular-nums text-gray-500">
        {clock(from)}
        <br />
        {to ? clock(to) : "ahora"}
      </span>
    </li>
  );
}

/** One goal: its text, and a ring of seven segments (days hit) or of time gathered. */
function GoalRow({ goal }: { goal: Goal }) {
  const met = goal.done >= goal.target;
  const n = goal.time ? 1 : 7;
  const share = goal.time ? Math.min(1, goal.done / goal.target) : 0;
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={cn("text-sm", met ? "font-semibold text-gray-900" : "text-gray-600")}>
        {goal.label}
        {goal.time ? <span className="text-gray-400"> · {hmm(goal.target)}+</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-gray-500">{goal.time ? hmm(goal.done) : `${goal.done}/${goal.target}`}</span>
        <svg viewBox="0 0 20 20" className="size-6 -rotate-90">
          {Array.from({ length: n }, (_, i) => {
            const c = 2 * Math.PI * 8;
            const seg = c / n;
            const on = goal.time ? true : goal.days[i];
            const len = goal.time ? share * c : seg - 1.5;
            return (
              <circle key={i} cx="10" cy="10" r="8" fill="none" strokeWidth="3" className={on ? "stroke-gray-900" : "stroke-gray-200"} strokeDasharray={`${len} ${c}`} strokeDashoffset={-i * seg} />
            );
          })}
          {goal.time ? <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className="stroke-gray-200" strokeDasharray={`${(1 - share) * 2 * Math.PI * 8} ${2 * Math.PI * 8}`} strokeDashoffset={-share * 2 * Math.PI * 8} /> : null}
        </svg>
      </span>
    </li>
  );
}
