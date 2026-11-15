"use client";

import { useEffect, useRef, useState } from "react";

import { rangeText, type Marker } from "~/lib/labs";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «19 oct», «17 mar 25» when it is not this year's. */
export function short(day: string, year: string) {
  const [y, m, d] = day.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${y === year ? "" : ` ${y!.slice(2)}`}`;
}

/**
 * One value through every test (Javier, 15-nov-2026: «and evolution
 * please»): its normal range in grey (said under it), each test a dot with its number on top,
 * amber when out, the date underneath. Tests evenly spaced, so two in the
 * same month do not sit on top of each other.
 */
export function LabEvolution({ m, year }: { m: Marker; year: string }) {
  // Drawn at the width it shows, so the numbers read the same on the phone and wide.
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(300);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(([e]) => e && e.contentRect.width > 0 && setW(Math.round(e.contentRect.width)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const points = m.points.filter((p) => p.value !== null);
  if (points.length < 2) return null;
  const H = 96;
  const TOP = 18;
  const BOTTOM = 18;
  const ranged = [...points].reverse().find((p) => p.low !== null || p.high !== null);
  const low = ranged?.low ?? null;
  const high = ranged?.high ?? null;
  const values = points.map((p) => p.value!);
  const edges = [low, high].filter((v): v is number => v !== null && v > 0);
  const min = Math.min(...values, ...edges);
  const max = Math.max(...values, ...edges);
  const pad = (max - min) * 0.12 || 1;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - BOTTOM);
  const x = (i: number) => 24 + (i / (points.length - 1)) * (W - 48);
  return (
    <figure ref={box} className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={points.map((p) => `${short(p.day, year)}: ${p.text}`).join(", ")}>
        {ranged ? (
          <rect x={0} width={W} y={y(Math.min(high ?? hi, hi))} height={y(Math.max(low ?? lo, lo)) - y(Math.min(high ?? hi, hi))} className="fill-gray-100" rx={4} />
        ) : null}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value!)}`).join(" ")} fill="none" className="stroke-gray-300" strokeWidth="1.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.day}>
            <circle cx={x(i)} cy={y(p.value!)} r={4} className={p.out ? "fill-amber-500" : "fill-gray-700"} stroke="white" strokeWidth="1.5" />
            <text x={x(i)} y={y(p.value!) - 8} textAnchor="middle" fontSize="11" fontWeight="600" className={p.out ? "fill-amber-700" : "fill-gray-900"}>
              {p.text}
            </text>
            <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="9" className="fill-gray-400">
              {short(p.day, year)}
            </text>
          </g>
        ))}
      </svg>
      {ranged ? <figcaption className="text-[11px] text-gray-400">En gris, lo normal: {rangeText(low, high)}</figcaption> : null}
    </figure>
  );
}
