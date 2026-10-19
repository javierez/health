import type { Finding } from "./findings";

/**
 * The groups a screen shows, in order: what he does, apart from what only
 * goes with his nights (Javier, 18-oct-2026: «distinguir entre relaciones
 * causales y cosas que suceden porque suceden»). Pure and client-safe.
 */
export function tiers(list: Finding[]): { label: string; list: Finding[] }[] {
  const ranked = (l: Finding[]) => [...l].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight));
  const clear = (f: Finding) => f.tier === "good" || f.tier === "bad";
  return [
    { label: "Te hace bien", list: ranked(list.filter((f) => f.controllable && f.tier === "good")) },
    { label: "Te hace mal", list: ranked(list.filter((f) => f.controllable && f.tier === "bad")) },
    { label: "Va junto, no es causa", list: ranked(list.filter((f) => !f.controllable && clear(f))) },
    { label: "Por aclarar", list: ranked(list.filter((f) => f.tier === "unclear")) },
  ];
}
