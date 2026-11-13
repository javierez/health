import { ThinkingOrb } from "thinking-orbs";

import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import { healthspan, paceOfAging, PILLARS, pillarValues, weeklyDeltas, WINDOW, type Pillar } from "~/lib/whoop/healthspan";
import { Empty, hmm, Label, Panel } from "./parts";

const SIX_MONTHS = 182;
const GROUPS = ["Sueño", "Esfuerzo", "Forma física"] as const;

/**
 * WHOOP's Healthspan: the age your habits put you at, how fast it moves, and
 * what each habit adds or takes. The orb is Vesta's (`thinking-orbs`), slowed
 * to a slow orbit, where WHOOP has its green particle sphere.
 */
export function HealthspanTab({ days, day, age, maxHr }: { days: Day[]; day: string; age: number | null; maxHr: number | null }) {
  const now = pillarValues(days, day, WINDOW, maxHr);
  const half = pillarValues(days, day, SIX_MONTHS, maxHr);
  const hs = healthspan(now, age);
  const deltas = weeklyDeltas(days, day, age, maxHr);
  const pace = paceOfAging(deltas);
  // Pace over time: the slope from the start of the six months up to each week.
  const paceLine = deltas.map((_, i) => (i < 9 ? null : paceOfAging(deltas.slice(0, i + 1))));
  if (!hs) {
    return (
      <Panel>
        <Empty>Faltan datos: hacen falta al menos cuatro hábitos medidos durante 10 días.</Empty>
      </Panel>
    );
  }
  const younger = hs.delta < 0;
  return (
    <div className="space-y-3">
      <Panel className="flex flex-col items-center gap-3 py-6">
        <div className="relative flex size-44 items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center opacity-70 [&_canvas]:scale-[2.6]">
            <ThinkingOrb state="working" size={64} speed={0.5} theme="light" />
          </div>
          <div className="relative text-center">
            <p className="text-4xl font-bold tabular-nums">{age === null ? `${younger ? "−" : "+"}${Math.abs(hs.delta).toFixed(1)}` : (age + hs.delta).toFixed(1)}</p>
            <Label>{age === null ? "años de edad WHOOP" : "edad WHOOP"}</Label>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-gray-50 py-2">
            <p className={cn("text-lg font-semibold tabular-nums", younger ? "text-gray-900" : "text-amber-600")}>{Math.abs(hs.delta).toFixed(1)} años</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{younger ? "más joven" : "más mayor"}</p>
          </div>
          <div className="rounded-lg bg-gray-50 py-2">
            <p className={cn("text-lg font-semibold tabular-nums", pace !== null && pace > 1 ? "text-amber-600" : "text-gray-900")}>{pace === null ? "–" : `${pace.toFixed(1)}x`}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">ritmo de envejecimiento</p>
          </div>
        </div>
        {age === null ? <p className="text-[11px] text-gray-400">Con tu fecha de nacimiento sale la edad entera y el VO₂ máx. cuenta.</p> : null}
      </Panel>

      <Panel title="Ritmo de envejecimiento">
        <PaceSlider pace={pace} />
        {paceLine.some((p) => p !== null) ? <PaceTrend points={paceLine} /> : <Empty>El ritmo necesita dos meses de datos.</Empty>}
      </Panel>

      {GROUPS.map((g) => (
        <Panel key={g} title={g} right={<span className="text-[10px] text-gray-400">▼ media 6 meses · ▲ 30 días</span>}>
          <ul className="space-y-4">
            {PILLARS.filter((p) => p.group === g).map((p) => (
              <PillarRow key={p.key} pillar={p} six={half[p.key]} month={now[p.key]} years={hs.contributions.find((c) => c.key === p.key)?.years ?? null} />
            ))}
          </ul>
        </Panel>
      ))}
      <p className="px-1 text-[11px] text-gray-400">
        La fórmula de WHOOP es suya; esta es la abierta de OpenStrap Edge: cada hábito con su riesgo de un metaanálisis (Liu 2017, Lee 2022, Momma 2022, Paluch 2022, Zhang 2016, Kodama 2009).
      </p>
    </div>
  );
}

const fmt = (p: Pillar, v: number) => (p.unit === "h" ? `${hmm(v * 60)} h` : p.key === "steps" ? Math.round(v).toLocaleString("es-ES") : `${Math.round(v)} ${p.unit}`);
const where = (p: Pillar, v: number) => Math.max(0, Math.min(1, (v - p.worse) / (p.better - p.worse)));
const BLOCKS = ["bg-amber-500", "bg-amber-400", "bg-amber-300", "bg-amber-200", "bg-gray-200", "bg-gray-300", "bg-gray-400", "bg-gray-500", "bg-gray-700", "bg-gray-900"];

/** Ten blocks from worse (amber) to better (dark), the 6-month mark above, the 30-day mark below, years on the right. */
function PillarRow({ pillar, six, month, years }: { pillar: Pillar; six: number | undefined; month: number | undefined; years: number | null }) {
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-800">{pillar.label}</span>
        <span className={cn("text-xs font-semibold tabular-nums", years === null ? "text-gray-400" : years > 0.05 ? "text-amber-600" : "text-gray-900")}>
          {years === null ? "–" : `${years > 0 ? "+" : years < 0 ? "−" : ""}${Math.abs(years).toFixed(1)} años`}
        </span>
      </div>
      <div className="relative pt-3 pb-3">
        {six !== undefined ? (
          <span className="absolute top-0 -translate-x-1/2 text-[9px] leading-none text-gray-900" style={{ left: `${where(pillar, six) * 100}%` }}>
            ▼
          </span>
        ) : null}
        <div className="flex gap-0.5">
          {BLOCKS.map((b) => (
            <span key={b} className={cn("h-2 flex-1 first:rounded-l-full last:rounded-r-full", b)} />
          ))}
        </div>
        {month !== undefined ? (
          <span className="absolute bottom-0 -translate-x-1/2 text-[9px] leading-none text-gray-400" style={{ left: `${where(pillar, month) * 100}%` }}>
            ▲
          </span>
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-gray-400">
        <span>{fmt(pillar, pillar.worse)}</span>
        <span className="text-gray-600">
          {six !== undefined ? `6 meses ${fmt(pillar, six)}` : ""}
          {month !== undefined ? ` · 30 días ${fmt(pillar, month)}` : ""}
        </span>
        <span>{fmt(pillar, pillar.better)}</span>
      </div>
    </li>
  );
}

/** −1.0x … 3.0x, the calendar's pace marked at 1.0x. */
function PaceSlider({ pace }: { pace: number | null }) {
  const at = (v: number) => ((v + 1) / 4) * 100;
  return (
    <div className="mb-4">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-2.5 flex gap-px">
          {Array.from({ length: 40 }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1", i / 10 - 1 < 1 ? "bg-gray-300" : "bg-amber-200")} />
          ))}
        </div>
        <span className="absolute top-1 h-4 w-px bg-gray-500" style={{ left: `${at(1)}%` }} />
        {pace !== null ? <span className="absolute top-0.5 size-5 -translate-x-1/2 rounded-full border-2 border-white bg-gray-900 shadow" style={{ left: `${at(pace)}%` }} /> : null}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>−1.0x · más lento</span>
        <span>1.0x</span>
        <span>3.0x · más rápido</span>
      </div>
    </div>
  );
}

function PaceTrend({ points }: { points: (number | null)[] }) {
  const W = 320;
  const H = 90;
  const x = (i: number) => 8 + (i / (points.length - 1)) * (W - 16);
  const y = (v: number) => 6 + (1 - (v + 1) / 4) * (H - 12);
  const d = points.flatMap((p, i) => (p === null ? [] : [`${x(i).toFixed(1)},${y(p).toFixed(1)}`]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1="8" x2={W - 8} y1={y(1)} y2={y(1)} strokeDasharray="3 3" className="stroke-gray-300" />
      <text x={W - 8} y={y(1) - 3} textAnchor="end" className="fill-gray-400 text-[8px]">1.0x</text>
      <polyline points={d.join(" ")} fill="none" strokeWidth="1.5" className="stroke-gray-800" />
    </svg>
  );
}
