import { and, asc, desc, eq, isNull, lt, lte, sql } from "drizzle-orm";

import { db } from "~/db";
import { waDays, waMessages } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { MOOD_LABEL } from "~/lib/wa-pattern";
import { transcribe } from "~/server/chat/media";
import { messagesPage, voiceNote } from "./client";
import { readDay, WA_VERSION } from "./read-day";
import { toRow } from "./records";

/**
 * His WhatsApp, once a day: the new messages, the voice notes of the days
 * about to be read, and one read per finished day. Run from `syncEverything`
 * on the first tick after midnight, so yesterday is whole when it is read.
 */
export async function syncWhatsapp(now = new Date()) {
  const errors: string[] = [];
  const [last] = await db.select({ at: sql<Date | null>`max(${waMessages.at})` }).from(waMessages);
  // A day of overlap: a message can land in Evolution after a newer one.
  const stopBefore = last?.at ? new Date(new Date(last.at).getTime() - 86_400_000) : null;
  // The first time, the newest 5,000; the rest of the history is `scripts/import-whatsapp.ts`.
  const imported = await importMessages({ stopBefore, maxPages: 100 }).catch((err: unknown) => {
    errors.push(`import: ${String(err)}`);
    return null;
  });
  // Yesterday, and one more if a read failed: the backlog is the script's, not a 300 s function's.
  const days = await readDays({ before: localDay(now), limit: 2, errors });
  return { imported, days, errors };
}

/** Pages newest first until past `stopBefore` (or the end). Rows already here only gain a body they lacked. */
export async function importMessages(opts: {
  stopBefore: Date | null;
  maxPages: number;
  write?: boolean;
  onPage?: (page: number, pages: number) => void;
}) {
  let page = 1;
  let pages = 1;
  let seen = 0;
  let written = 0;
  let oldest: Date | null = null;
  let newest: Date | null = null;
  while (page <= Math.min(pages, opts.maxPages)) {
    const res = await messagesPage(page);
    pages = res.pages;
    opts.onPage?.(page, pages);
    // Evolution can list one message twice in a page, and one insert cannot touch a row twice: the one with a body wins.
    const byId = new Map<string, NonNullable<ReturnType<typeof toRow>>>();
    for (const row of res.records.flatMap((r) => toRow(r) ?? [])) {
      if (!byId.get(row.id)?.body) byId.set(row.id, row);
    }
    const rows = [...byId.values()];
    seen += res.records.length;
    for (const r of rows) {
      if (!oldest || r.at < oldest) oldest = r.at;
      if (!newest || r.at > newest) newest = r.at;
    }
    if (opts.write !== false && rows.length > 0) {
      // A row already here keeps what it has (a voice note's transcript); only a missing body is filled.
      const done = await db
        .insert(waMessages)
        .values(rows)
        .onConflictDoUpdate({
          target: waMessages.id,
          set: { body: sql`excluded.body` },
          setWhere: sql`${waMessages.body} is null and excluded.body is not null`,
        })
        .returning({ id: waMessages.id });
      written += done.length;
    }
    if (res.records.length === 0 || (opts.stopBefore && oldest && oldest < opts.stopBefore)) break;
    page += 1;
  }
  if (opts.write !== false) await resolveLids();
  return { pages: page, of: pages, seen, written, oldest, newest };
}

/**
 * A chat on a LID that never had its number stamped takes the number another
 * message of the same LID did have.
 */
export async function resolveLids() {
  await db.execute(sql`
    update wa_messages m set chat = k.chat
    from (
      select distinct on (raw->'key'->>'remoteJid') raw->'key'->>'remoteJid' as jid, chat
      from wa_messages
      where chat not like 'lid:%' and raw->'key'->>'remoteJid' like '%@lid'
    ) k
    where m.chat like 'lid:%' and m.raw->'key'->>'remoteJid' = k.jid`);
}

/** Who each number is: the latest name they gave themselves. */
export async function chatNames(): Promise<Map<string, string>> {
  const rows = await db.execute<{ chat: string; name: string }>(sql`
    select distinct on (chat) chat, name from wa_messages
    where name is not null and not from_me
    order by chat, at desc`);
  return new Map(rows.map((r) => [r.chat, r.name]));
}

const WA_PROMPT = "Nota de voz de WhatsApp, en español de España, entre amigos, familia o clientes de una inmobiliaria.";

/** Up to five minutes a note, sixty notes a day: what a busy day has, at about a cent a minute. */
async function transcribeDay(day: string, errors: string[]) {
  const notes = await db
    .select({ id: waMessages.id })
    .from(waMessages)
    .where(and(eq(waMessages.day, day), eq(waMessages.type, "audioMessage"), isNull(waMessages.body), lte(waMessages.seconds, 300)))
    .orderBy(asc(waMessages.at))
    .limit(60);
  let heard = 0;
  const one = async (id: string) => {
    try {
      const audio = await voiceNote(id);
      const text = await transcribe(audio.bytes, audio.mime, WA_PROMPT);
      if (text) {
        await db.update(waMessages).set({ body: text }).where(eq(waMessages.id, id));
        heard += 1;
      }
    } catch (err) {
      // WhatsApp drops the file after about two weeks: the note stays "[nota de voz]".
      if (errors.length < 5) errors.push(`voice ${id}: ${String(err).slice(0, 120)}`);
    }
  };
  // Four at a time: a busy day's notes in well under a minute.
  for (let i = 0; i < notes.length; i += 4) await Promise.all(notes.slice(i, i + 4).map((n) => one(n.id)));
  return heard;
}

/** Below this a day says nothing about how it left him: two "ok" are not a mood. */
const MIN_MESSAGES = 20;

/**
 * The finished days worth reading and not read yet with this version, newest
 * first, with what they weigh (a line is capped at 500 characters when read).
 */
export async function pendingDays(before: string, limit: number) {
  return db
    .select({
      day: waMessages.day,
      messages: sql<number>`count(*)::int`,
      chars: sql<number>`sum(least(length(coalesce(${waMessages.body}, '')), 500) + 30)::int`,
    })
    .from(waMessages)
    .leftJoin(waDays, and(eq(waDays.day, waMessages.day), eq(waDays.promptVersion, WA_VERSION)))
    .where(and(lt(waMessages.day, before), isNull(waDays.day)))
    .groupBy(waMessages.day)
    .having(sql`count(*) >= ${MIN_MESSAGES}`)
    .orderBy(desc(waMessages.day))
    .limit(limit);
}

export async function readDays(opts: { before: string; limit: number; errors: string[] }) {
  const pending = await pendingDays(opts.before, opts.limit);
  if (pending.length === 0) return [];

  const names = await chatNames();
  const done: { day: string; heard: number; ok: boolean }[] = [];
  for (const { day } of pending) {
    const heard = await transcribeDay(day, opts.errors);
    const messages = await db
      .select({
        chat: waMessages.chat,
        fromMe: waMessages.fromMe,
        at: waMessages.at,
        type: waMessages.type,
        body: waMessages.body,
        seconds: waMessages.seconds,
      })
      .from(waMessages)
      .where(eq(waMessages.day, day));
    const r = await readDay(day, messages, names);
    if (!r.ok) {
      opts.errors.push(`${day}: ${r.detail}`);
      done.push({ day, heard, ok: false });
      continue;
    }
    const row = { summary: r.summary, mood: r.mood, chats: r.chats, messages: messages.length, model: r.model, promptVersion: WA_VERSION };
    await db
      .insert(waDays)
      .values({ day, ...row })
      .onConflictDoUpdate({ target: waDays.day, set: { ...row, createdAt: new Date() } });
    done.push({ day, heard, ok: true });
  }
  return done;
}

/** The last days he wrote or was written to, for the agent: one line each. */
export async function recentWhatsapp(today: string, days = 3): Promise<string[]> {
  const rows = await db
    .select()
    .from(waDays)
    .where(sql`${waDays.day} >= ${addDays(today, -days)}`)
    .orderBy(asc(waDays.day));
  return rows.map((d) => {
    const marked = d.chats.filter((c) => c.tone === "tensa" || c.tone === "mala" || c.effect);
    const detail = marked.map((c) => `${c.name} (${c.tone}): ${c.line}${c.effect ? ` ${c.effect}` : ""}`);
    const mood = d.mood ? ` (${MOOD_LABEL[d.mood]?.toLowerCase()})` : "";
    return `- ${d.day}${mood}: ${d.summary}${detail.length > 0 ? ` ${detail.join(" ")}` : ""}`;
  });
}
