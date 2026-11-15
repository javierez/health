import { addDays } from "~/lib/day";
import { ZONE_LABEL, type Work, type Zone } from "~/lib/exercises";
import { cn } from "~/lib/utils";
import { LOADED, READY } from "~/server/training/next";
import type { ZoneWeek } from "~/server/training/summary";
import { BACK, FRONT, type BodySide } from "./body-paths";

/** Trained before, and not for this long: it is waiting for him. */
export const FORGOTTEN_DAYS = 10;

/**
 * How much is still in each muscle (`ZoneWeek.fatigue`), as heat (Javier,
 * 18-oct-2026: «no está muy claro… lo que está más usado, fatigado… versus lo
 * que no… tipo mapa de calor del cuerpo»). Amber needs rest; gray is ready.
 */
export const HEAT = [
  { from: LOADED, label: "Cargado", fill: "fill-amber-500" },
  { from: READY, label: "Recuperándose", fill: "fill-amber-200" },
  { from: 0, label: "Listo", fill: "fill-gray-200" },
] as const;

export const isForgotten = (z: ZoneWeek, today: string) => z.sets === 0 && z.last !== null && z.last < addDays(today, -FORGOTTEN_DAYS);

export const zoneFill = (z: ZoneWeek) => HEAT.find((h) => z.fatigue >= h.from)?.fill ?? "fill-gray-200";

export function Dot({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden>
      <circle cx="5" cy="5" r="5" className={fill} />
    </svg>
  );
}

/** Listo · Recuperándose · Cargado, cold to hot. */
export function HeatLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500", className)}>
      {[...HEAT].reverse().map((h) => (
        <span key={h.label} className="flex items-center gap-1">
          <Dot fill={h.fill} />
          {h.label}
        </span>
      ))}
    </div>
  );
}

function Side({ side, fill, onSelect }: { side: BodySide; fill: (z: Zone) => string; onSelect?: (z: Zone) => void }) {
  return (
    <>
      <path d={side.base} className="fill-gray-100 stroke-white" strokeWidth={1} />
      {(Object.entries(side.muscles) as [Zone, string][]).map(([zone, d]) => (
        <path
          key={zone}
          d={d}
          className={cn(fill(zone), "stroke-white", onSelect && "cursor-pointer")}
          strokeWidth={1}
          onClick={onSelect ? () => onSelect(zone) : undefined}
        >
          <title>{ZONE_LABEL[zone]}</title>
        </path>
      ))}
      <path d={side.outline} className="fill-none stroke-gray-300" strokeWidth={2} />
    </>
  );
}

/** One session's sets on a muscle, as heat: 3 or more, 1 to 3, a little. */
export const SESSION_HEAT = [
  { from: 3, label: "3+ series", fill: "fill-amber-500" },
  { from: 1, label: "1 a 3", fill: "fill-amber-300" },
  { from: 0.01, label: "Ayudó", fill: "fill-amber-100" },
] as const;

/**
 * Front and back, every muscle as hot as it is loaded today; or, given a
 * session's `sets` (`Session.muscles`), as hot as that session worked it.
 */
export function BodyMap({ zones = [], sets, onSelect, className }: { zones?: ZoneWeek[]; sets?: Work; onSelect?: (z: Zone) => void; className?: string }) {
  const fill = (zone: Zone) => {
    if (sets) return SESSION_HEAT.find((h) => (sets[zone] ?? 0) >= h.from)?.fill ?? "fill-gray-200";
    const z = zones.find((x) => x.zone === zone);
    return z ? zoneFill(z) : "fill-gray-200";
  };
  return (
    <svg viewBox="39 156 1370 1205" className={className} role="img" aria-label={sets ? "Qué músculos trabajó" : "Cómo de cargado está cada músculo"}>
      <Side side={FRONT} fill={fill} onSelect={onSelect} />
      <Side side={BACK} fill={fill} onSelect={onSelect} />
    </svg>
  );
}
