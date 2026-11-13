import { useState } from "react";

import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import { METRICS, trend, WEEKLY_TOTAL, zone, type MetricKey, type Span } from "~/lib/whoop/stats";
import { Panel, Segmented, show } from "./parts";

const SPANS = [
  { key: "W", label: "Semana" },
  { key: "M", label: "Mes" },
  { key: "6M", label: "6 meses" },
] as const;
const BARS = new Set<MetricKey>(["z13", "z45", "strength", "steps", "kcal", "strain"]);
const KEYS = Object.keys(METRICS) as MetricKey[];

/**
 * WHOOP's Trend View, for any metric: the period's total or average, the
 * change against the period before, and the days drawn as bars (amounts) or a
 * line (levels). Recovery adds its breakdown of days by zone.
 */
export function TrendTab({ days, day, metric, onMetric }: { days: Day[]; day: string; metric: MetricKey; onMetric: (k: MetricKey) => void }) {
  const [span, setSpan] = useState<Span>("W");
  const t = trend(days, metric, span, day);
  const m = METRICS[metric];
  const total = WEEKLY_TOTAL.has(metric) && span === "W";
  const worse = t.change !== null && m.up !== null && t.change > 0 !== m.up && Math.abs(t.change) >= 3;
  const versus = span === "W" ? "la semana anterior" : span === "M" ? "el mes anterior" : "los 3 meses anteriores";
  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select value={metric} onChange={(e) => onMetric(e.target.value as MetricKey)} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium">
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {METRICS[k].label}
              </option>
            ))}
          </select>
          <Segmented options={SPANS} value={span} onChange={setSpan} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{total ? "Total de la semana" : "Media"}</p>
            <p className="text-3xl font-bold tabular-nums">
              {show(metric, t.value)} <span className="text-sm font-normal text-gray-500">{m.unit !== "h" ? m.unit : ""}</span>
            </p>
          </div>
          {t.change !== null ? (
            <span className={cn("rounded-full px-2.5 py-1 text-xs tabular-nums", worse ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700")}>
              {t.change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(t.change))}% frente a {versus}
            </span>
          ) : null}
        </div>
        <Chart points={t.points} bars={BARS.has(metric) && span !== "6M"} metric={metric} />
      </Panel>
      {metric === "recovery" ? <Breakdown days={days} day={day} span={span} /> : null}
    </div>
  );
}

function Chart({ points, bars, metric }: { points: { label: string; from: string; value: number | null }[]; bars: boolean; metric: MetricKey }) {
  const [pick, setPick] = useState<number | null>(null);
  const vs = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (vs.length === 0) return <p className="py-10 text-center text-sm text-gray-500">Sin datos en este periodo.</p>;
  const hi = Math.max(...vs);
  const lo = bars ? 0 : Math.min(...vs);
  const span = hi - lo || 1;
  const picked = pick === null ? null : points[pick];
  return (
    <div className="mt-4">
      <p className="h-4 text-xs tabular-nums text-gray-500">{picked ? `${picked.from} · ${show(metric, picked.value)}` : ""}</p>
      {bars ? (
        <div className="flex h-36 items-end gap-0.5">
          {points.map((p, i) => (
            <button
              key={p.from}
              type="button"
              onClick={() => setPick(i)}
              className={cn("flex-1 rounded-t-sm", i === pick ? "bg-gray-900" : "bg-gray-300", p.value === null && "bg-transparent")}
              style={{ height: `${p.value === null ? 0 : Math.max(2, ((p.value - lo) / span) * 100)}%` }}
            />
          ))}
        </div>
      ) : (
        <svg viewBox="0 0 320 140" className="h-36 w-full" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2="320" y1={140 * f} y2={140 * f} className="stroke-gray-100" />
          ))}
          <polyline
            fill="none"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="stroke-gray-800"
            points={points.flatMap((p, i) => (p.value === null ? [] : [`${(i / Math.max(1, points.length - 1)) * 316 + 2},${130 - ((p.value - lo) / span) * 120}`])).join(" ")}
          />
          {points.map((p, i) =>
            p.value === null ? null : (
              <circle key={p.from} cx={(i / Math.max(1, points.length - 1)) * 316 + 2} cy={130 - ((p.value - lo) / span) * 120} r={i === pick ? 3.5 : 2} className={i === pick ? "fill-gray-900" : "fill-gray-500"} onClick={() => setPick(i)} />
            ),
          )}
        </svg>
      )}
      <div className="mt-1 flex justify-between gap-0.5 text-[9px] tabular-nums text-gray-400">
        {points.map((p) => (
          <span key={p.from} className="flex-1 truncate text-center">
            {p.label}
          </span>
        ))}
      </div>
      <p className="mt-1 text-right text-[10px] tabular-nums text-gray-400">
        {show(metric, lo)} – {show(metric, hi)}
      </p>
    </div>
  );
}

/** Days by recovery zone in the period: WHOOP's «breakdown (days)». */
function Breakdown({ days, day, span }: { days: Day[]; day: string; span: Span }) {
  const n = span === "W" ? 7 : span === "M" ? 30 : 182;
  const from = new Date(`${day}T12:00:00Z`).getTime() - (n - 1) * 86_400_000;
  const xs = days.filter((d) => d.recovery !== null && new Date(`${d.day}T12:00:00Z`).getTime() >= from && d.day <= day);
  const c = { high: 0, mid: 0, low: 0 };
  for (const d of xs) c[zone(d.recovery!)] += 1;
  const rows = [
    { k: "high" as const, label: "Alta", tone: "bg-gray-900" },
    { k: "mid" as const, label: "Media", tone: "bg-gray-400" },
    { k: "low" as const, label: "Baja", tone: "bg-amber-500" },
  ];
  return (
    <Panel title="Días por zona">
      <div className="flex h-3 overflow-hidden rounded-full">
        {rows.map((r) => (
          <span key={r.k} className={r.tone} style={{ width: `${(c[r.k] / Math.max(1, xs.length)) * 100}%` }} />
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-gray-600">
        {rows.map((r) => (
          <span key={r.k} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", r.tone)} />
            {r.label} <b className="tabular-nums">{c[r.k]}</b>
          </span>
        ))}
      </p>
    </Panel>
  );
}
