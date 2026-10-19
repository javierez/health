import { and, eq, gte, isNotNull } from "drizzle-orm";

import { db } from "~/db";
import { episodes, waDays } from "~/db/schema";
import { summarizeTalks, type Conversations, type Talk } from "~/lib/conversations";
import { addDays, localDay } from "~/lib/day";
import { counterpartLabel } from "~/lib/taxonomy";

/** Eight weeks of WhatsApp chats and Pocket conversations, each with its tone. */
export async function loadConversations(): Promise<Conversations> {
  const today = localDay(new Date());
  const since = addDays(today, -60);
  const [days, spoken] = await Promise.all([
    db.select({ day: waDays.day, chats: waDays.chats }).from(waDays).where(gte(waDays.day, since)),
    db
      .select({ day: episodes.day, counterpart: episodes.counterpart, tone: episodes.tone, theme: episodes.theme })
      .from(episodes)
      .where(and(eq(episodes.isCurrent, true), isNotNull(episodes.tone), gte(episodes.day, since))),
  ]);
  const talks: Talk[] = [
    ...days.flatMap((d) =>
      d.chats.map((c): Talk => ({ day: d.day, source: "whatsapp", who: c.name || c.chat, tone: c.tone, topic: c.topic ?? null })),
    ),
    ...spoken.flatMap((e): Talk[] =>
      e.day && e.tone
        ? [{ day: e.day, source: "pocket", who: counterpartLabel(e.counterpart) ?? "En persona", tone: e.tone, topic: e.theme }]
        : [],
    ),
  ];
  return summarizeTalks(talks, today);
}
