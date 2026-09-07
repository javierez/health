import type { Category } from "~/db/schema";

/**
 * The fixed order every bar, legend and tab uses.
 *
 * Fixed and not sorted-by-size on purpose: a stacked bar whose segments move
 * between days cannot be compared across a week by eye, which is the one thing
 * this screen is for.
 */
export const CATEGORY_ORDER: Category[] = [
  "business",
  "health",
  "sport",
  "personal",
  "social",
  "learning",
  "ambient",
  "other",
  "noise",
];

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

/**
 * An amber-to-neutral ramp, because the palette is neutral + amber and nothing
 * else. It stays readable as a stacked bar without importing a second design
 * system's worth of colour.
 */
export const CATEGORY_FILL: Record<Category, string> = {
  business: "bg-amber-500",
  health: "bg-amber-400",
  sport: "bg-amber-300",
  personal: "bg-gray-500",
  social: "bg-gray-400",
  learning: "bg-gray-300",
  ambient: "bg-gray-200",
  other: "bg-gray-200",
  noise: "bg-gray-100",
};

export const CATEGORY_CHIP: Record<Category, string> = {
  business: "bg-sky-100 text-sky-600",
  health: "bg-orange-200 text-orange-700",
  sport: "bg-orange-200 text-orange-700",
  personal: "bg-gray-200 text-gray-700",
  social: "bg-gray-200 text-gray-700",
  learning: "bg-gray-200 text-gray-700",
  ambient: "bg-gray-100 text-gray-400",
  other: "bg-gray-100 text-gray-500",
  noise: "bg-gray-100 text-gray-400",
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
