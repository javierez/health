import type { Product, SkinCategory } from "~/db/schema";
import { routineTitle } from "~/lib/routines";
import type { Source } from "~/server/assistant/evidence";
import type { Standing } from "~/server/commitments/standing";

/**
 * «Piel»: his creams, the habit each goes with, and what the evidence says
 * (checked 17-oct-2026). The same lines go to the agent, so what it proposes
 * from a photo stands on the same ground as the ⓘ on the panel.
 */
export const SKIN_SOURCES = {
  hughes: { short: "Hughes et al., Ann Intern Med 2013", url: "https://doi.org/10.7326/0003-4819-158-11-201306040-00002" },
  aad: {
    short: "American Academy of Dermatology",
    url: "https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen",
  },
  mukherjee: { short: "Mukherjee et al., Clin Interv Aging 2006", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2699641/" },
  oyetakin: { short: "Oyetakin-White et al., Clin Exp Dermatol 2015", url: "https://doi.org/10.1111/ced.12455" },
} satisfies Record<string, Source>;

export interface SkinEvidence {
  title: string;
  line: string;
  why: string;
  source: Source;
  /** The categories it speaks to; null for every cream. */
  for: SkinCategory[] | null;
}

export const SKIN_EVIDENCE: SkinEvidence[] = [
  {
    title: "Solar cada día, no solo en verano",
    line: "Envejece menos la piel en 4,5 años",
    why: "903 adultos, sorteados a solar diaria o cuando quisieran: los de diaria, sin envejecimiento detectable de la piel a los 4,5 años.",
    source: SKIN_SOURCES.hughes,
    for: ["solar"],
  },
  {
    title: "Repite cada 2 h si estás fuera",
    line: "Y tras sudar o bañarte",
    why: "SPF 30 o más, amplio espectro, cada 2 horas al aire libre.",
    source: SKIN_SOURCES.aad,
    for: ["solar"],
  },
  {
    title: "Retinol de noche, 3 días a la semana",
    line: "Empieza suave: irrita",
    why: "Los retinoides son lo más estudiado contra el fotoenvejecimiento. Retinol y retinaldehído irritan bastante menos que la tretinoína.",
    source: SKIN_SOURCES.mukherjee,
    for: ["retinol"],
  },
  {
    title: "Dormir también es piel",
    line: "Con mal sueño, la barrera se repara un 30 % peor",
    why: "60 personas: quien dormía mal tenía más signos de envejecimiento y su piel recuperaba la barrera un 30 % peor a las 72 h. Asociación, no causa.",
    source: SKIN_SOURCES.oyetakin,
    for: null,
  },
];

export const evidenceFor = (category: SkinCategory) => SKIN_EVIDENCE.filter((e) => e.for === null || e.for.includes(category));

/** What the agent is told the evidence says. */
export const SKIN_LINES = SKIN_EVIDENCE.map((e) => `- ${e.title}: ${e.why} (${e.source.short}).`).join("\n");

/** The habit a cream goes with, and the name its icon is drawn for: every solar is «Crema solar». */
const ROUTINE: Record<SkinCategory, string | null> = {
  solar: "Crema solar",
  retinol: "Retinol",
  hidratante: "Hidratante",
  limpiador: "Limpiador",
  otro: null,
};
export const routineName = (p: Pick<Product, "category" | "name">) => ROUTINE[p.category] ?? p.name;

/** Its routine among his commitments, by its moment (`~/lib/routines`). */
export function routineOf(p: Pick<Product, "moment">, list: Standing[]): Standing | null {
  const title = routineTitle(p.moment);
  return title === null ? null : (list.find((s) => s.commitment.title === title) ?? null);
}

/** «Cada mañana», «3 noches por semana», or just «Noche» before he has a habit for it. */
export function whenText(p: Pick<Product, "moment">, routine: Standing | null): string | null {
  const m = p.moment;
  if (m === "entreno") return routineTitle(m);
  if (!routine) return m ? m.charAt(0).toUpperCase() + m.slice(1) : null;
  const { period, target } = routine.commitment;
  if (period === "day" || target >= 7) return `Cada ${m ?? "día"}`;
  const n = Math.round(target);
  const unit = m === "mañana" ? "mañanas" : m === "noche" ? "noches" : "días";
  return `${n} ${n === 1 ? unit.slice(0, -1) : unit} por semana`;
}
