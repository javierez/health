import { and, asc, eq, gte, ilike, inArray, lte, notIlike, or, sql } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages, codeRecords, episodes, facts, medical, waDays, waMessages, whoopRecords } from "~/db/schema";
import { env } from "~/env";
import { addDays, hm, localClock, localDay } from "~/lib/day";
import { MOOD_LABEL } from "~/lib/wa-pattern";
import { needMinutes, type SleepRaw } from "~/server/assistant/context";
import { lineText, phoneLabel } from "~/server/evolution/records";
import { chatNames } from "~/server/evolution/sync";
import { whatsappPattern } from "~/server/queries/whatsapp";

/**
 * The agent's `buscar`: whatever is not already in the context it gets on
 * every message (that covers the last days). Weeks back, what was heard in a
 * recording, what a doctor said, and the ids it needs to delete or archive.
 * Plain lines, capped, newest last.
 */
export const SEARCH_KINDS = ["apuntes", "sueño", "entrenos", "ficha", "grabaciones", "chat", "codigo", "whatsapp"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

const MAX_LINES = 120;

interface Range {
  from: string;
  to: string;
  text: string | null;
}

/** Days as asked, or the last two weeks. A reversed range is put the right way round. */
export function range(input: { desde?: unknown; hasta?: unknown }, today: string): { from: string; to: string } {
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const to = day(input.hasta) ?? today;
  const from = day(input.desde) ?? addDays(to, -13);
  return from <= to ? { from, to } : { from: to, to: from };
}

export async function search(kind: SearchKind, r: Range): Promise<string> {
  const lines = await LOOKUPS[kind](r);
  if (lines.length === 0) return `Nada en ${kind} entre ${r.from} y ${r.to}${r.text ? ` con «${r.text}»` : ""}.`;
  const cut = lines.length > MAX_LINES;
  return [...(cut ? [`(${lines.length} líneas, las ${MAX_LINES} últimas)`] : []), ...lines.slice(-MAX_LINES)].join("\n");
}

const like = (t: string | null) => (t ? `%${t}%` : null);

const LOOKUPS: Record<SearchKind, (r: Range) => Promise<string[]>> = {
  apuntes: async ({ from, to, text }) => {
    const rows = await db
      .select()
      .from(facts)
      .where(and(gte(facts.day, from), lte(facts.day, to), text ? ilike(facts.summary, like(text)!) : undefined))
      .orderBy(asc(facts.at));
    return rows.map((f) => `[${f.id}] ${f.day} ${localClock(f.at)} ${f.kind}: ${f.summary}${f.chatMessageId ? " (chat)" : " (grabación)"}`);
  },

  sueño: async ({ from, to }) => {
    const rows = await db
      .select()
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["sleep", "recovery"]), gte(whoopRecords.day, from), lte(whoopRecords.day, to)))
      .orderBy(asc(whoopRecords.startAt));
    return rows.flatMap((w) => {
      if (w.kind === "recovery") {
        const sc = (w.raw as { score?: { recovery_score?: number; hrv_rmssd_milli?: number } | null }).score;
        return [`${w.day} recuperación ${sc?.recovery_score ?? "?"} %, HRV ${sc?.hrv_rmssd_milli ? Math.round(sc.hrv_rmssd_milli) : "?"} ms`];
      }
      const raw = w.raw as SleepRaw;
      const bed = raw.score?.stage_summary;
      const asleep = bed?.total_in_bed_time_milli ? (bed.total_in_bed_time_milli - (bed.total_awake_time_milli ?? 0)) / 60_000 : null;
      const start = w.startAt ? localClock(w.startAt) : "?";
      return [`${w.day} ${raw.nap ? "siesta" : "noche"} desde las ${start}: dormido ${hm(asleep)}, necesitaba ${hm(needMinutes(raw))}`];
    });
  },

  entrenos: async ({ from, to, text }) => {
    const [whoop, logged] = await Promise.all([
      db
        .select()
        .from(whoopRecords)
        .where(and(eq(whoopRecords.kind, "workout"), gte(whoopRecords.day, from), lte(whoopRecords.day, to)))
        .orderBy(asc(whoopRecords.startAt)),
      db
        .select()
        .from(facts)
        .where(and(eq(facts.kind, "training"), gte(facts.day, from), lte(facts.day, to), text ? ilike(facts.summary, like(text)!) : undefined))
        .orderBy(asc(facts.at)),
    ]);
    return [
      ...whoop.map((w) => {
        const raw = w.raw as { sport_name?: string | null; score?: { strain?: number; distance_meter?: number } | null };
        const km = raw.score?.distance_meter ? `, ${(raw.score.distance_meter / 1000).toFixed(1)} km` : "";
        return `${w.day} WHOOP ${raw.sport_name ?? "?"}, ${hm((w.durationSeconds ?? 0) / 60)}${km}`;
      }),
      ...logged.map((f) => `[${f.id}] ${f.day} apuntado: ${f.summary}`),
    ].sort();
  },

  ficha: async ({ text }) => {
    const rows = await db
      .select()
      .from(medical)
      .where(text ? or(ilike(medical.title, like(text)!), ilike(medical.details, like(text)!)) : undefined)
      .orderBy(asc(medical.createdAt));
    return rows.map(
      (m) => `[${m.id}] ${m.kind}${m.onDay ? ` ${m.onDay}` : ""}: ${m.title}${m.details ? `. ${m.details}` : ""}${m.active ? "" : " (archivada)"}`,
    );
  },

  grabaciones: async ({ from, to, text }) => {
    const rows = await db
      .select()
      .from(episodes)
      .where(
        and(
          eq(episodes.isCurrent, true),
          gte(episodes.day, from),
          lte(episodes.day, to),
          sql`${episodes.category} not in ('ambient', 'noise')`,
          text ? or(ilike(episodes.oneLiner, like(text)!), sql`array_to_string(${episodes.people}, ' ') ilike ${like(text)}`) : undefined,
        ),
      )
      .orderBy(asc(episodes.day), asc(episodes.recordingId), asc(episodes.seq));
    return rows.map(
      (e) => `${e.day} ${hm((e.durationSeconds ?? 0) / 60)} ${e.category}/${e.kind ?? "?"}${e.call ? " (llamada)" : ""}: ${e.oneLiner ?? ""}`,
    );
  },

  chat: async ({ from, to, text }) => {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          gte(chatMessages.createdAt, new Date(`${from}T00:00:00Z`)),
          lte(chatMessages.createdAt, new Date(`${addDays(to, 1)}T00:00:00Z`)),
          text ? ilike(chatMessages.body, like(text)!) : undefined,
        ),
      )
      .orderBy(asc(chatMessages.createdAt));
    return rows.map((m) => `${localDay(m.createdAt)} ${localClock(m.createdAt)} ${m.direction === "in" ? "Él" : "Tú"}: ${m.body ?? `[${m.type}]`}`);
  },

  codigo: async ({ from, to }) => {
    const rows = await db
      .select({
        day: codeRecords.day,
        author: codeRecords.author,
        lines: sql<number>`sum(${codeRecords.additions})::int`,
        commits: sql<number>`count(*)::int`,
      })
      .from(codeRecords)
      // A repo's first commit is an import, not a day's writing (same as the board).
      .where(
        and(
          eq(codeRecords.kind, "commit"),
          gte(codeRecords.day, from),
          lte(codeRecords.day, to),
          notIlike(codeRecords.title, "Initial commit%"),
        ),
      )
      .groupBy(codeRecords.day, codeRecords.author)
      .orderBy(asc(codeRecords.day));
    return rows.map((c) => `${c.day} ${c.author === (env.GITHUB_LOGIN ?? "javierez") ? "él" : (c.author ?? "?")}: ${c.commits} commits, +${c.lines} líneas`);
  },

  // Without text, the pattern and each day read; with a name or a number, that conversation; with anything else, the messages that say it.
  whatsapp: async ({ from, to, text }) => {
    if (!text) {
      const [pattern, days] = await Promise.all([
        whatsappPattern(),
        db
          .select()
          .from(waDays)
          .where(and(gte(waDays.day, from), lte(waDays.day, to)))
          .orderBy(asc(waDays.day)),
      ]);
      const bands = pattern.rows.map((r) => `${r.band} ${r.days} días, recuperación ${r.recovery ?? "?"} %, HRV ${r.hrv ?? "?"} ms`);
      return [
        `Patrón (todo el historial, recuperación a la mañana siguiente): ${pattern.headline} ${bands.join("; ")}.`,
        ...(pattern.topics.length > 0
          ? [`Temas tensos (12 semanas, % de conversaciones tensas o malas): ${pattern.topics.map((t) => `${t.topic} ${t.tense} % de ${t.chats}`).join("; ")}.`]
          : []),
        ...days.flatMap((d) => [
          `${d.day} (${d.messages} mensajes${d.mood ? `, ${MOOD_LABEL[d.mood]?.toLowerCase()}` : ""}): ${d.summary}`,
          ...d.chats.map((c) => `  ${c.name}${c.topic ? ` (${c.topic})` : ""}, ${c.tone}: ${c.line}${c.effect ? ` ${c.effect}` : ""}`),
        ]),
      ];
    }
    const names = await chatNames();
    const needle = text.toLowerCase();
    const digits = text.replace(/\D/g, "");
    const people = [...names].filter(([chat, name]) => name.toLowerCase().includes(needle) || (digits.length >= 6 && chat.includes(digits)));
    const rows = await db
      .select()
      .from(waMessages)
      .where(
        and(
          gte(waMessages.day, from),
          lte(waMessages.day, to),
          people.length > 0 ? inArray(waMessages.chat, people.map(([chat]) => chat)) : ilike(waMessages.body, like(text)!),
        ),
      )
      .orderBy(asc(waMessages.at));
    return rows.map((m) => {
      const who = names.get(m.chat) ?? phoneLabel(m.chat);
      return `${m.day} ${localClock(m.at)} ${m.fromMe ? `Él a ${who}` : who}: ${lineText(m)}`;
    });
  },
};
