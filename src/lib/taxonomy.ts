import type { ModelCategory } from "~/db/schema";

/**
 * 🚨 The criteria layer. Free text was the bug, not the feature.
 *
 * The first pass let the model write `subcategory` in its own words. Measured
 * on the real corpus: 195 `business` episodes carried **140 distinct**
 * subcategories — `client call`, `client sales call` and `client support call`
 * are the same thing spelled three ways, so nothing above a single episode
 * could ever be counted. A taxonomy you cannot group by is a comment field.
 *
 * So the model now picks from a CLOSED list, and every value below ships with
 * the rule that decides it. Two axes, deliberately orthogonal:
 *
 *   `kind`        — what the activity WAS (per category)
 *   `counterpart` — who was on the other side of it (universal)
 *
 * Keeping `counterpart` out of `kind` is what makes "how many business calls
 * this week" answerable: it is `business` episodes whose counterpart is not
 * `solo`. Folded into `kind`, that same question needs a list of which kinds
 * happen to imply a human, and that list rots.
 *
 * `subcategory` survives as the free-text detail line, shown but never summed.
 */

export interface Term {
  value: string;
  label: string;
  /** The rule the model is given. Written to be decidable from a transcript. */
  criteria: string;
}

/**
 * Who else was there. Universal, because "was anyone else on this?" is the
 * same question in every category and the answer is what the counts are for.
 */
export const COUNTERPARTS: Term[] = [
  {
    value: "solo",
    label: "Solo",
    criteria:
      "One voice only. Dictation, a voice note, thinking aloud, or narration to a device. If a second human speaks at all, this is not solo.",
  },
  {
    value: "colleague",
    label: "Compañero",
    criteria:
      "Someone on the speaker's own side: co-founder, employee, teammate. They talk about 'our' product, users or roadmap as insiders.",
  },
  {
    value: "client",
    label: "Cliente",
    criteria:
      "A customer, a prospect, or a user of the product being sold. They ask for support, a demo, a price, or an account change.",
  },
  {
    value: "partner",
    label: "Socio",
    criteria:
      "External but not buying: a supplier, agency, contractor, lawyer, investor, or another company's staff.",
  },
  {
    value: "family",
    label: "Familia",
    criteria:
      "A partner, parent, sibling, child, or other relative. Household logistics and family news land here.",
  },
  {
    value: "friend",
    label: "Amigo",
    criteria: "A personal, non-family, non-work relationship.",
  },
  {
    value: "stranger",
    label: "Desconocido",
    criteria:
      "A shop assistant, a call centre, a mechanic, a receptionist — a transaction with someone with no ongoing relationship.",
  },
  {
    value: "media",
    label: "Medios",
    criteria:
      "No live person at all. The voices come from a TV, a video, a podcast or music playing nearby.",
  },
];

export const COUNTERPART_VALUES = COUNTERPARTS.map((c) => c.value);
export type Counterpart = (typeof COUNTERPART_VALUES)[number];

/**
 * `kind` per category. Kept SHORT on purpose — a list of thirty is a free-text
 * field with extra steps, and the model will not hold the distinctions. Each
 * category gets the handful the corpus actually shows, plus the criterion that
 * separates it from its nearest neighbour.
 */
export const KINDS: Record<ModelCategory, Term[]> = {
  business: [
    {
      value: "client-call",
      label: "Llamada con cliente",
      criteria:
        "A live conversation with a customer or prospect: demo, sale, onboarding, support, or an account question. The defining test is who is on the line, not the topic.",
    },
    {
      value: "team-sync",
      label: "Reunión de equipo",
      criteria:
        "Internal coordination with colleagues: status, task assignment, planning, workload, who-does-what. Not building the thing, deciding who builds it.",
    },
    {
      value: "product",
      label: "Producto",
      criteria:
        "Deciding what to build or how it should work: spec, roadmap, design or UX review, feature planning. Content is about the product itself.",
    },
    {
      value: "technical",
      label: "Técnico",
      criteria:
        "Hands-on with a system: a bug, an integration, infrastructure, a data migration, IT setup, troubleshooting a tool.",
    },
    {
      value: "legal-admin",
      label: "Legal y administración",
      criteria:
        "Contracts, GDPR and compliance, invoicing, expenses, vesting, insurance, company paperwork.",
    },
    {
      value: "partner-vendor",
      label: "Socio / proveedor",
      criteria:
        "Negotiating or coordinating with another company that is not a customer: suppliers, agencies, portals, recruitment.",
    },
    {
      value: "marketing",
      label: "Marketing",
      criteria:
        "Reaching the market: content, social media, PR, campaigns, influencers, competitor research, pricing positioning.",
    },
    {
      value: "training",
      label: "Formación",
      criteria:
        "Teaching the product or a process to someone else — a session where one side is instructing and the other is learning to USE something.",
    },
    {
      value: "solo-work",
      label: "Trabajo en solitario",
      criteria:
        "Work with no second human: dictating notes, a voice memo to an assistant, thinking a decision through aloud.",
    },
  ],
  health: [
    { value: "medical", label: "Médico", criteria: "A doctor, clinic, diagnosis, treatment, test result, or a medical complaint being described." },
    { value: "injury", label: "Lesión", criteria: "A specific physical injury or its rehabilitation — knee, back, physio exercises." },
    { value: "sleep-rest", label: "Sueño y descanso", criteria: "Sleep, tiredness, jet lag, recovery, or the deliberate absence of effort." },
    { value: "nutrition", label: "Nutrición", criteria: "What is being eaten or drunk, framed as diet, supplements, or fuelling — not the logistics of a meal." },
    { value: "mental", label: "Mental", criteria: "Stress, mood, anxiety, therapy, or a deliberate reflection on how the speaker is doing." },
  ],
  sport: [
    { value: "training", label: "Entrenamiento", criteria: "A structured session: gym, drills, a plan being followed or given, sets and reps." },
    { value: "mobility", label: "Movilidad", criteria: "Warm-up, stretching, mobility or rehab movement — preparation rather than the effort itself." },
    { value: "endurance", label: "Resistencia", criteria: "Running, cycling, hiking, swimming — sustained movement over distance." },
    { value: "team-sport", label: "Deporte de equipo", criteria: "Playing a sport with others: football, basketball, padel, a match or a scratch game." },
    { value: "planning", label: "Planificación", criteria: "Talking ABOUT sport to be done — a plan, a schedule, a race entry — without doing it now." },
  ],
  personal: [
    { value: "household", label: "Hogar", criteria: "Running a home: chores, repairs, laundry, groceries, bills, appliances, moving." },
    { value: "logistics", label: "Logística", criteria: "Arranging when and where: meeting up, pickups, parking, packing, appointments. Coordination with a concrete outcome." },
    { value: "travel", label: "Viaje", criteria: "A trip: planning it, being in transit, or dealing with it. Includes the drive and the airport." },
    { value: "errand", label: "Recado", criteria: "A transaction out in the world: a shop, a bike repair, a service counter, a utility company." },
    { value: "family-life", label: "Vida familiar", criteria: "Family news, check-ins and decisions that are not logistics — how people are doing." },
    { value: "money", label: "Dinero", criteria: "Personal spending, costs, purchases and their price — outside the business." },
    { value: "reflection", label: "Reflexión", criteria: "Thinking aloud about the speaker's own life, plans or feelings, alone." },
  ],
  social: [
    { value: "catch-up", label: "Puesta al día", criteria: "Two people deliberately updating each other on their lives. There is news being exchanged." },
    { value: "banter", label: "Cachondeo", criteria: "Joking, teasing, riffing. The content is not the point; the exchange is." },
    { value: "meal", label: "Comida", criteria: "Conversation over food or drink — lunch, dinner, coffee, a bar." },
    { value: "storytelling", label: "Batallita", criteria: "One person holding the floor with an anecdote while others listen." },
    { value: "greeting", label: "Saludo", criteria: "Hellos, goodbyes, birthday wishes, the opening or closing ritual of a call. Short by nature." },
    { value: "small-talk", label: "Charla breve", criteria: "Low-stakes filler between people who are together for another reason: the lift, the corridor, waiting." },
  ],
  learning: [
    { value: "course", label: "Curso", criteria: "Structured instruction the speaker is RECEIVING: a class, a lesson, a training they attend." },
    { value: "media", label: "Contenido", criteria: "A podcast, video or audiobook being consumed attentively, and reacted to." },
    { value: "practice", label: "Práctica", criteria: "Rehearsing a skill: a language, an instrument, a roleplay, a quiz." },
    { value: "research", label: "Investigación", criteria: "Deliberately reading up on or investigating a topic to understand it." },
  ],
  ambient: [
    { value: "tv-video", label: "Tele / vídeo", criteria: "A screen playing in the room: television, a film, a clip, a trailer." },
    { value: "music", label: "Música", criteria: "Music playing, with no conversation being carried on top of it." },
    { value: "podcast-radio", label: "Podcast / radio", criteria: "Spoken-word audio playing in the background that nobody is responding to." },
    { value: "silence", label: "Silencio", criteria: "The recorder was on and nothing happened. No speech, no media." },
    { value: "crowd", label: "Gente alrededor", criteria: "Other people's voices nearby that the speaker is not part of: a café, a street, an office at large." },
  ],
  other: [
    { value: "fragment", label: "Fragmento", criteria: "Too short or too cut off to say what it was." },
    { value: "unclear", label: "Confuso", criteria: "Audible but unintelligible, or context-free enough that any category would be a guess." },
    { value: "setup", label: "Preparativos", criteria: "The dead time around an activity: dialling, waiting for someone to join, testing the mic." },
  ],
};

const KIND_INDEX = new Map<string, Term>(
  Object.values(KINDS).flat().map((t) => [t.value, t]),
);
const COUNTERPART_INDEX = new Map<string, Term>(
  COUNTERPARTS.map((t) => [t.value, t]),
);

export function kindLabel(value: string | null): string | null {
  return value ? (KIND_INDEX.get(value)?.label ?? value) : null;
}

export function counterpartLabel(value: string | null): string | null {
  return value ? (COUNTERPART_INDEX.get(value)?.label ?? value) : null;
}

/** The kinds valid for a category, as bare values. */
export function kindsFor(category: ModelCategory): string[] {
  return KINDS[category].map((t) => t.value);
}

/**
 * The criteria block handed to the model, rendered once at module load.
 * Every value the model may return appears here with its rule; nothing is
 * implied by the value name alone.
 */
export function criteriaPrompt(): string {
  const kinds = (Object.keys(KINDS) as ModelCategory[])
    .map(
      (c) =>
        `${c}:\n` +
        KINDS[c].map((t) => `  - ${t.value} — ${t.criteria}`).join("\n"),
    )
    .join("\n\n");

  const counterparts = COUNTERPARTS.map(
    (t) => `  - ${t.value} — ${t.criteria}`,
  ).join("\n");

  return (
    `KIND — pick exactly one, from the list for the category you chose:\n\n${kinds}\n\n` +
    `COUNTERPART — who else was there. Pick exactly one:\n\n${counterparts}\n\n` +
    `Rules that decide the close calls:\n` +
    `  - kind and counterpart are independent. A client call about a bug is ` +
    `kind=client-call, counterpart=client — not kind=technical.\n` +
    `  - counterpart is about the OTHER voice, never the topic. Talking to a ` +
    `colleague about your family is counterpart=colleague.\n` +
    `  - if two people are on the line, counterpart is never solo, however ` +
    `little the second one says.\n` +
    `  - when a kind genuinely does not fit, pick the closest one and say why ` +
    `in subcategory. Never invent a value outside the list.`
  );
}
