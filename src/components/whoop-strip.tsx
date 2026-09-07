"use client";

import { Activity as Pulse, BedDouble, Flame } from "lucide-react";

import { formatSpan } from "~/lib/categories";
import { cn } from "~/lib/utils";
import type { WhoopDay } from "~/server/queries/whoop";

/**
 * WHOOP's three numbers for a day, on one line.
 *
 * Deliberately three and not everything WHOOP knows: recuperación, sueño and
 * strain are the ones that change what the day meant. HRV, respiratory rate
 * and the rest are in `whoop_records.raw` for when a screen actually needs
 * them; putting them here would bury the three that matter.
 *
 * A missing value is not drawn. WHOOP has 267 days and the recorder has 16, so
 * half-empty days are the normal case, not an error state.
 */

/**
 * The numbers stay grey — the RINGS carry the colour. Three coloured rings and
 * three coloured lines saying the same thing is the same fact shouted twice.
 */
function tone(value: number | null, good: number): string {
  if (value === null) return "text-gray-400";
  return value >= good ? "text-gray-900" : "text-gray-500";
}

export function WhoopStrip({ whoop, className }: { whoop: WhoopDay; className?: string }) {
  const bits: { icon: typeof Pulse; text: string; klass: string }[] = [];

  if (whoop.recovery !== null) {
    bits.push({
      icon: Pulse,
      text: `${Math.round(whoop.recovery)}% recuperación`,
      klass: tone(whoop.recovery, 67),
    });
  }
  if (whoop.sleepSeconds !== null && whoop.sleepSeconds > 0) {
    bits.push({
      icon: BedDouble,
      text:
        whoop.sleepScore !== null
          ? `${formatSpan(whoop.sleepSeconds)} de sueño · ${Math.round(whoop.sleepScore)}%`
          : `${formatSpan(whoop.sleepSeconds)} de sueño`,
      klass: tone(whoop.sleepScore, 85),
    });
  }
  if (whoop.strain !== null) {
    bits.push({
      icon: Flame,
      text: `${whoop.strain.toFixed(1)} de esfuerzo`,
      klass: tone(whoop.strain, 14),
    });
  }

  if (bits.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {bits.map((b) => (
        <span key={b.text} className={cn("flex items-center gap-1 text-xs", b.klass)}>
          <b.icon className="h-3.5 w-3.5" />
          <span className="tabular-nums">{b.text}</span>
        </span>
      ))}
      {whoop.workouts.length > 0 ? (
        <span className="text-xs text-gray-400">
          {whoop.workouts.length} entreno{whoop.workouts.length === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

/** The workouts themselves, listed under the rail when a day is open. */
export function WhoopWorkouts({ whoop }: { whoop: WhoopDay }) {
  if (whoop.workouts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {whoop.workouts.map((w, i) => (
        <span
          key={`${w.sport ?? "?"}-${i}`}
          className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
        >
          <Flame className="h-3 w-3 text-gray-400" />
          {SPORTS[w.sport ?? ""] ?? w.sport ?? "Entreno"}
          {w.seconds ? (
            <span className="tabular-nums text-gray-400">{formatSpan(w.seconds)}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/** WHOOP's `sport_name`, in Spanish. Anything unmapped shows through as-is. */
const SPORTS: Record<string, string> = {
  activity: "Actividad",
  cycling: "Bici",
  "functional-fitness": "Funcional",
  "increase_alertness": "Despertar",
  padel: "Pádel",
  powerlifting: "Powerlifting",
  "race-walking": "Marcha",
  running: "Correr",
  skiing: "Esquí",
  soccer: "Fútbol",
  spin: "Spinning",
  swimming: "Natación",
  tennis: "Tenis",
  walking: "Caminar",
  weightlifting: "Pesas",
  yoga: "Yoga",
};
