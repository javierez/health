import { cn } from "~/lib/utils";
import type { HrPoint, Segment, Stage, StressPoint } from "~/lib/whoop/intraday";
import { level } from "~/lib/whoop/intraday";
import { clock } from "./parts";

/**
 * WHOOP's line charts, drawn by hand in SVG like the rest of health: a thin
 * line with a faint fill, axis labels and no grid, dotted marks at the moments
 * that matter (falling asleep, waking), shaded spans (activities, sleep).
 */
const W = 320;
const H = 120;
const PAD = { l: 24, r: 6, t: 8, b: 16 };

function scale(from: number, to: number, lo: number, hi: number) {
  const x = (t: number) => PAD.l + ((t - from) / Math.max(1, to - from)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - PAD.t - PAD.b);
  return { x, y };
}

export function HrLine({ points, lines, marks }: { points: HrPoint[]; lines?: { t: number; label: string }[]; marks?: [number, number][] }) {
  if (points.length < 2) return null;
  const from = points[0]!.t;
  const to = points.at(-1)!.t;
  const lo = Math.floor(Math.min(...points.map((p) => p.bpm)) / 10) * 10 - 10;
  const hi = Math.ceil(Math.max(...points.map((p) => p.bpm)) / 10) * 10 + 10;
  const { x, y } = scale(from, to, lo, hi);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`).join("");
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4).map((v) => Math.round(v / 10) * 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="hrfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(55 65 81)" stopOpacity="0.18" />
          <stop offset="1" stopColor="rgb(55 65 81)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {marks?.map(([a, b]) => (
        <rect key={a} x={x(Math.max(a, from))} width={Math.max(1, x(Math.min(b, to)) - x(Math.max(a, from)))} y={PAD.t} height={H - PAD.t - PAD.b} className="fill-amber-100" />
      ))}
      {ticks.map((v) => (
        <text key={v} x={2} y={y(v) + 3} className="fill-gray-400 text-[8px] tabular-nums">
          {v}
        </text>
      ))}
      <path d={`${d}L${x(to)},${H - PAD.b}L${x(from)},${H - PAD.b}Z`} fill="url(#hrfill)" />
      <path d={d} fill="none" strokeWidth="1.2" className="stroke-gray-700" />
      {lines?.map((l) => (
        <g key={l.t}>
          <line x1={x(l.t)} x2={x(l.t)} y1={PAD.t} y2={H - PAD.b} strokeDasharray="2 2" className="stroke-gray-400" />
          <circle cx={x(l.t)} cy={H - PAD.b} r="2" className="fill-gray-700" />
          <text x={x(l.t)} y={H - 4} textAnchor="middle" className="fill-gray-500 text-[8px] tabular-nums">
            {l.label}
          </text>
        </g>
      ))}
      {!lines ? (
        <>
          <text x={PAD.l} y={H - 4} className="fill-gray-400 text-[8px] tabular-nums">
            {clock(from)}
          </text>
          <text x={W - PAD.r} y={H - 4} textAnchor="end" className="fill-gray-400 text-[8px] tabular-nums">
            {clock(to)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/** Sleep stages, darker the deeper: WHOOP's lilac-to-purple, in greys. */
export const STAGE_TONE: Record<Stage, string> = { awake: "bg-gray-200", light: "bg-gray-400", rem: "bg-gray-600", deep: "bg-gray-900" };
const STAGE_FILL: Record<Stage, string> = { awake: "fill-gray-200", light: "fill-gray-400", rem: "fill-gray-600", deep: "fill-gray-900" };
const STAGE_ROW: Stage[] = ["awake", "rem", "light", "deep"];
export const STAGE_LABEL: Record<Stage, string> = { awake: "Despierto", light: "Ligero", deep: "Profundo", rem: "REM" };

/** The night as blocks on four rows: WHOOP's stage drill-down. */
export function Hypnogram({ segments }: { segments: Segment[] }) {
  if (segments.length === 0) return null;
  const from = segments[0]!.start;
  const to = segments.at(-1)!.end;
  const { x } = scale(from, to, 0, 1);
  const rowH = (H - PAD.t - PAD.b) / 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {STAGE_ROW.map((s, i) => (
        <g key={s}>
          <rect x={PAD.l} y={PAD.t + i * rowH + 1} width={W - PAD.l - PAD.r} height={rowH - 2} rx="2" className="fill-gray-50" />
          <text x={0} y={PAD.t + i * rowH + rowH / 2 + 3} className="fill-gray-400 text-[7px]">
            {STAGE_LABEL[s].slice(0, 4)}
          </text>
        </g>
      ))}
      {segments.map((g) => (
        <rect key={g.start} x={x(g.start)} width={Math.max(0.8, x(g.end) - x(g.start))} y={PAD.t + STAGE_ROW.indexOf(g.stage) * rowH + 1} height={rowH - 2} rx="1" className={STAGE_FILL[g.stage]} />
      ))}
      <text x={PAD.l} y={H - 4} className="fill-gray-400 text-[8px] tabular-nums">
        {clock(from)}
      </text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" className="fill-gray-400 text-[8px] tabular-nums">
        {clock(to)}
      </text>
    </svg>
  );
}

const LEVEL_STROKE = { low: "stroke-gray-300", mid: "stroke-gray-600", high: "stroke-amber-500" } as const;
export const LEVEL_BG = { low: "bg-gray-300", mid: "bg-gray-600", high: "bg-amber-500" } as const;

/** Stress through the day on 0–3, each stretch coloured by its level, sleep and activities shaded. */
export function StressLine({ points, spans }: { points: StressPoint[]; spans: { start: number; end: number; kind: "sleep" | "activity" }[] }) {
  if (points.length < 2) return null;
  const from = points[0]!.t;
  const to = points.at(-1)!.t;
  const { x, y } = scale(from, to, 0, 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[1, 2, 3].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-gray-100" />
          <text x={4} y={y(v) + 3} className="fill-gray-400 text-[8px]">
            {v}.0
          </text>
        </g>
      ))}
      {spans.map((s) => (
        <rect key={s.start} x={x(Math.max(from, s.start))} width={Math.max(0, x(Math.min(to, s.end)) - x(Math.max(from, s.start)))} y={PAD.t} height={H - PAD.t - PAD.b} className={cn(s.kind === "sleep" ? "fill-gray-100" : "fill-amber-50")} />
      ))}
      {points.slice(1).map((p, i) => {
        const a = points[i]!;
        // A gap over 20 minutes is the band off or an activity: no line across it.
        if (p.t - a.t > 20 * 60_000) return null;
        return <line key={p.t} x1={x(a.t)} y1={y(a.value)} x2={x(p.t)} y2={y(p.value)} strokeWidth="1.6" strokeLinecap="round" className={LEVEL_STROKE[level((a.value + p.value) / 2)]} />;
      })}
      <circle cx={x(to)} cy={y(points.at(-1)!.value)} r="2.5" className="fill-gray-900" />
      <text x={PAD.l} y={H - 4} className="fill-gray-400 text-[8px] tabular-nums">
        {clock(from)}
      </text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" className="fill-gray-400 text-[8px] tabular-nums">
        {clock(to)}
      </text>
    </svg>
  );
}
