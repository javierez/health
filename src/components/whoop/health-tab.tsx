import { Check, TriangleAlert } from "lucide-react";

import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import { METRICS, personalRange, type MetricKey } from "~/lib/whoop/stats";
import { VITALS } from "./home-tab";
import { Panel, show } from "./parts";

/**
 * WHOOP's Health Monitor: last night's five vitals, each against its own
 * range (the 30 nights before, ± one deviation). A tick when inside, amber
 * when not: the point is spotting the night something is off.
 */
export function HealthTab({ days, day, onTrend }: { days: Day[]; day: string; onTrend: (k: MetricKey) => void }) {
  return (
    <Panel title="Lecturas de anoche">
      <div className="grid grid-cols-2 gap-2">
        {VITALS.map((k) => {
          const r = personalRange(days, k, day);
          const fmt = (v: number) => show(k, v);
          return (
            <button key={k} type="button" onClick={() => onTrend(k)} className={cn("rounded-lg p-3 text-left", r?.within === false ? "bg-amber-50" : "bg-gray-50")}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">{METRICS[k].label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {r?.value == null ? "–" : fmt(r.value)} <span className="text-xs font-normal text-gray-500">{METRICS[k].unit}</span>
              </p>
              {r ? (
                <p className={cn("mt-1 flex items-center gap-1 text-[11px] tabular-nums", r.within === false ? "text-amber-700" : "text-gray-500")}>
                  {r.within === false ? <TriangleAlert className="size-3" /> : r.within ? <Check className="size-3" /> : null}
                  {fmt(r.low)}–{fmt(r.high)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">Sin rango aún</p>
              )}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
