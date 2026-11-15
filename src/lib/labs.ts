/**
 * His blood tests, marker by marker (Javier, 15-nov-2026: «just the analysis
 * of blood… and track some things»). Pure: the rows come from `lab_results`.
 *
 * Read for him, not for a doctor (Javier: «difficult to see and interpret»),
 * and only the latest test counts («its only important about the LATEST
 * analysis… and specially if they've been wrong before»): what is out in it,
 * the ones out before too first.
 */
export interface LabRow {
  day: string;
  lab: string;
  panel: string;
  marker: string;
  value: number | null;
  shown: string | null;
  unit: string | null;
  low: number | null;
  high: number | null;
}

export type Out = "low" | "high" | null;
export interface Point {
  day: string;
  value: number | null;
  /** As printed: «4,3», «Negativo», «<0,6». */
  text: string;
  low: number | null;
  high: number | null;
  out: Out;
}
export interface Marker {
  marker: string;
  panel: string;
  unit: string | null;
  /** Oldest first. */
  points: Point[];
}
export interface Labs {
  /** Each test, oldest first. */
  tests: { day: string; lab: string }[];
  panels: { panel: string; markers: Marker[] }[];
  /** Out of range in the latest test: the ones out before too first, then the furthest out. */
  now: Marker[];
}

const PANELS = ["Hormonas", "Hemograma", "Bioquímica", "Lípidos", "Hierro", "Vitaminas", "Inflamación", "Proteínas", "Coagulación", "Marcadores", "Serologías"];

/** Strictly past the edge: 48 % against «17-48» is in range. */
export function outOf(value: number, low: number | null, high: number | null): Out {
  if (low !== null && value < low) return "low";
  if (high !== null && value > high) return "high";
  return null;
}

/** «4,3», «1.800» (grouped even at four digits, as labs print it), «0,98»: as a Spanish lab prints it. */
export const labNumber = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);

/** «4,4 a 11,5», «menos de 5», «más de 30». */
export function rangeText(low: number | null, high: number | null): string | null {
  if (low !== null && high !== null) return low === 0 ? `menos de ${labNumber(high)}` : `${labNumber(low)} a ${labNumber(high)}`;
  if (high !== null) return `menos de ${labNumber(high)}`;
  if (low !== null) return `más de ${labNumber(low)}`;
  return null;
}

/** How far out, in plain words: «un 24 % por encima del máximo», «rozando el mínimo» (under 5 %). */
export function howFar(p: Point): string | null {
  if (!p.out || p.value === null) return null;
  const edge = p.out === "high" ? p.high! : p.low!;
  const share = Math.abs(p.value - edge) / edge;
  const side = p.out === "high" ? "máximo" : "mínimo";
  if (share < 0.05) return `rozando el ${side}`;
  return `un ${Math.round(share * 100)} % ${p.out === "high" ? "por encima del" : "por debajo del"} ${side}`;
}

/**
 * What each one measures, in a line he can read without a doctor: what it
 * is and what moves it, never what he has. Only the ones that tend to come
 * out; the rest show their name alone.
 */
const MEANING: Record<string, string> = {
  TSH: "La hormona con la que el cerebro le pide trabajo al tiroides. Alta: el tiroides rinde algo menos de lo que se le pide.",
  "T4 libre": "La hormona que fabrica el tiroides.",
  Creatinina: "Un desecho del músculo que limpia el riñón. Sube si el riñón filtra menos, y también con mucho músculo o entreno fuerte.",
  "Filtrado glomerular": "Cuánta sangre limpia el riñón por minuto; sale de la creatinina.",
  "Vitamina D": "Para huesos, músculo y defensas. Baja con poco sol, sobre todo en otoño e invierno.",
  IgG: "Los anticuerpos de memoria: las defensas que quedan de infecciones y vacunas.",
  Gammaglobulinas: "El total de anticuerpos de la sangre; la IgG es la mayor parte.",
  Leucocitos: "Los glóbulos blancos, las defensas. Suben con una infección.",
  Neutrófilos: "Los glóbulos blancos que atacan a las bacterias.",
  "Neutrófilos %": "Los glóbulos blancos que atacan a las bacterias.",
  Linfocitos: "Los glóbulos blancos de los virus y de la memoria inmune.",
  "Linfocitos %": "Los glóbulos blancos de los virus y de la memoria inmune.",
  Monocitos: "Glóbulos blancos que limpian restos.",
  Eosinófilos: "Glóbulos blancos de alergias y parásitos.",
  "Eosinófilos %": "Glóbulos blancos de alergias y parásitos.",
  Glucosa: "El azúcar en sangre. Sube si no estabas en ayunas.",
  PCR: "La inflamación. Se dispara con una infección.",
  LDH: "Una enzima que sale de las células cuando se gastan.",
};
export const meaningOf = (marker: string) => MEANING[marker] ?? null;

/** The one read with it: the TSH with its T4, the creatinine with the kidney filter. */
export const PARTNER: Record<string, string> = { TSH: "T4 libre", Creatinina: "Filtrado glomerular" };

/** The earlier tests where it was out too. */
export const outBefore = (m: Marker) => m.points.slice(0, -1).filter((p) => p.out);

/** How far out the last one is, to put the furthest first. */
const distance = (m: Marker) => {
  const p = m.points.at(-1)!;
  const edge = p.out === "high" ? p.high! : p.low!;
  return Math.abs(p.value! - edge) / edge;
};

export function labsOf(rows: LabRow[]): Labs {
  const tests = [...new Map(rows.map((r) => [r.day, { day: r.day, lab: r.lab }])).values()].sort((a, b) => a.day.localeCompare(b.day));
  const byMarker = new Map<string, Marker>();
  for (const r of [...rows].sort((a, b) => a.day.localeCompare(b.day))) {
    const m = byMarker.get(r.marker) ?? { marker: r.marker, panel: r.panel, unit: r.unit, points: [] };
    m.points.push({
      day: r.day,
      value: r.value,
      text: r.shown ?? (r.value === null ? "" : labNumber(r.value)),
      low: r.low,
      high: r.high,
      out: r.value === null || r.shown?.startsWith("<") ? null : outOf(r.value, r.low, r.high),
    });
    byMarker.set(r.marker, m);
  }
  const order = (p: string) => (PANELS.includes(p) ? PANELS.indexOf(p) : PANELS.length);
  const markers = [...byMarker.values()];
  const panels = [...new Set(markers.map((m) => m.panel))]
    .sort((a, b) => order(a) - order(b))
    .map((panel) => ({ panel, markers: markers.filter((m) => m.panel === panel) }));
  const latest = tests.at(-1)?.day;
  const again = (m: Marker) => (outBefore(m).length > 0 ? 1 : 0);
  const now = panels
    .flatMap((p) => p.markers)
    .filter((m) => m.points.at(-1)!.day === latest && m.points.at(-1)!.out)
    .sort((a, b) => again(b) - again(a) || distance(b) - distance(a));
  return { tests, panels, now };
}
