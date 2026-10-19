import type { Category } from "~/db/schema";

export const CATEGORY_LABELS: Record<Category, string> = {
  business: "Trabajo",
  health: "Salud",
  sport: "Deporte",
  personal: "Personal",
  social: "Social",
  learning: "Aprendizaje",
  ambient: "Ambiente",
  other: "Otros",
  noise: "Ruido",
};

/** `3h 12m` / `48m` / `—`. What every total on the rollup screens reads as. */
export function formatSpan(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}
