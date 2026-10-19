/**
 * The groups a day on the panel is made of, in the order they read. Shared by
 * the query that fills them and the chips that filter them.
 */
export const GROUPS = [
  { key: "sleep", label: "Sueño" },
  { key: "training", label: "Entreno" },
  { key: "meals", label: "Comidas" },
  { key: "work", label: "Trabajo" },
  { key: "life", label: "Vida" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "medical", label: "Médico" },
] as const;
export type GroupKey = (typeof GROUPS)[number]["key"];

export const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label])) as Record<GroupKey, string>;
