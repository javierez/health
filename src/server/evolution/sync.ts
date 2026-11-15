import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "~/db";
import { waDays, waMessages } from "~/db/schema";
import { env } from "~/env";
import { addDays, localDay } from "~/lib/day";
import { MOOD_LABEL } from "~/lib/wa-pattern";
import { transcribe } from "~/server/chat/media";
import { mediaOf, messagesPage } from "./client";
import { readDay, WA_VERSION, type DayMessage } from "./read-day";
import { toRow } from "./records";
import { seePhoto } from "./see";
import { toldInFollowed } from "./told";

/**
 * His WhatsApp, every four hours (`syncEverything`): the new messages, every
 * voice note and photo of the chats he follows and what he told there about
 * his body (`./told`), and a read of today so far, of yesterday once it is
 * whole, and of any day that grew since it was read.
 */
export async function syncWhatsapp(now = new Date()) {
  const errors: string[] = [];
  const imported = await catchUpMessages().catch((err: unknown) => {
    errors.push(`import: ${String(err)}`);
    return null;
  });
  const today = localDay(now);
  // Three days back: a pass that failed is caught by the next, and WhatsApp keeps the files two weeks.
  const followed = await hearAndSee(await unheardUnseen({ since: addDays(today, -2), limit: 60 }), errors);
  // What he ate, trained or felt, once its notes are words and its photos a sentence.
  const chats = followedChats();
  const told = chats.length > 0 ? await toldInFollowed(now, chats, await chatNames(), errors) : 0;
  // Two at most: the backlog is the script's, not a 300 s function's.
  const days = await readDays({ since: addDays(today, -2), before: addDays(today, 1), limit: 2, errors });
  return { imported, followed, told, days, errors };
}

/**
 * The messages since the last stored, without reading the day: free, no
 * model. Also before the morning note, so his first message of the morning
 * is there to say how long the night could have been (`quietNight`).
 */
export async function catchUpMessages() {
  const [last] = await db.select({ at: sql<Date | null>`max(${waMessages.at})` }).from(waMessages);
  // A day of overlap: a message can land in Evolution after a newer one.
  const stopBefore = last?.at ? new Date(new Date(last.at).getTime() - 86_400_000) : null;
  // The first time, the newest 5,000; the rest of the history is `scripts/import-whatsapp.ts`.
  return importMessages({ stopBefore, maxPages: 100 });
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
          target: [waMessages.userId, waMessages.id],
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

/**
 * The chats he follows closely (`WHATSAPP_FOLLOW`, numbers as digits, comma
 * separated): every voice note heard and every photo described, not only on
 * the days that get read. His partner's, since 14-nov-2026.
 */
export function followedChats(): string[] {
  return (env.WHATSAPP_FOLLOW ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
}

const PHOTOS = ["imageMessage", "associatedChildMessage"];

/** The voice notes without words and the photos without a description, oldest first, in the chats he follows. */
export async function unheardUnseen(opts: { since: string; limit: number; ids?: string[] }) {
  const chats = followedChats();
  if (chats.length === 0) return [];
  return db
    .select({ id: waMessages.id, type: waMessages.type })
    .from(waMessages)
    .where(
      and(
        inArray(waMessages.chat, chats),
        gte(waMessages.day, opts.since),
        opts.ids ? inArray(waMessages.id, opts.ids) : undefined,
        or(
          // A note copied from Vesta has no length: heard all the same.
          and(eq(waMessages.type, "audioMessage"), isNull(waMessages.body), or(isNull(waMessages.seconds), lte(waMessages.seconds, 900))),
          and(inArray(waMessages.type, PHOTOS), isNull(waMessages.seen)),
        ),
      ),
    )
    .orderBy(asc(waMessages.at))
    .limit(opts.limit);
}

type Media = (id: string) => Promise<{ bytes: Buffer; mime: string }>;

/**
 * A voice note as its words, a photo as one sentence. The file comes from
 * WhatsApp through Evolution unless `media` says otherwise (Vesta's copies,
 * `scripts/whatsapp-media.ts`). Four at a time.
 */
export async function hearAndSee(rows: { id: string; type: string }[], errors: string[], media: Media = mediaOf) {
  let heard = 0;
  let seen = 0;
  const one = async (r: { id: string; type: string }) => {
    try {
      const file = await media(r.id);
      if (r.type === "audioMessage") {
        const body = await transcribe(file.bytes, file.mime, WA_PROMPT);
        if (body) {
          await db.update(waMessages).set({ body }).where(eq(waMessages.id, r.id));
          heard += 1;
        }
      } else {
        const what = await seePhoto(file.bytes, file.mime);
        if (what) {
          await db.update(waMessages).set({ seen: what }).where(eq(waMessages.id, r.id));
          seen += 1;
        }
      }
    } catch (err) {
      // WhatsApp drops the file after about two weeks: the note stays "[nota de voz]", the photo "[foto]".
      if (errors.length < 5) errors.push(`media ${r.id}: ${String(err).slice(0, 120)}`);
    }
  };
  for (let i = 0; i < rows.length; i += 4) await Promise.all(rows.slice(i, i + 4).map(one));
  return { heard, seen };
}

/** Up to five minutes a note, sixty notes a day: what a busy day has, at about a cent a minute. */
async function transcribeDay(day: string, errors: string[]) {
  const notes = await db
    .select({ id: waMessages.id, type: waMessages.type })
    .from(waMessages)
    .where(and(eq(waMessages.day, day), eq(waMessages.type, "audioMessage"), isNull(waMessages.body), lte(waMessages.seconds, 300)))
    .orderBy(asc(waMessages.at))
    .limit(60);
  return (await hearAndSee(notes, errors)).heard;
}

/** Below this a day says nothing about how it left him: two "ok" are not a mood. */
const MIN_MESSAGES = 20;

/**
 * The days worth reading that were never read with this version, or have
 * more messages than when they were (today, read every four hours; yesterday,
 * once its night is in), newest first, with what they weigh (a line is
 * capped at 500 characters when read).
 */
export async function pendingDays(before: string, limit: number, since = "") {
  return db
    .select({
      day: waMessages.day,
      messages: sql<number>`count(*)::int`,
      chars: sql<number>`sum(least(length(coalesce(${waMessages.body}, '')), 500) + 30)::int`,
    })
    .from(waMessages)
    .leftJoin(waDays, eq(waDays.day, waMessages.day))
    .where(and(lt(waMessages.day, before), gte(waMessages.day, since)))
    .groupBy(waMessages.day, waDays.promptVersion, waDays.messages)
    .having(
      sql`count(*) >= ${MIN_MESSAGES} and (${waDays.promptVersion} is distinct from ${WA_VERSION} or ${waDays.messages} < count(*))`,
    )
    .orderBy(desc(waMessages.day))
    .limit(limit);
}

export async function readDays(opts: { since?: string; before: string; limit: number; errors: string[] }) {
  const pending = await pendingDays(opts.before, opts.limit, opts.since);
  if (pending.length === 0) return [];
  const names = await chatNames();
  const done: { day: string; heard: number; ok: boolean }[] = [];
  for (const { day } of pending) done.push(await readAndStore(day, names, opts.errors));
  return done;
}

/** One day read and kept, whatever it was before: its voice notes first, then the model. */
async function readAndStore(day: string, names: Map<string, string>, errors: string[]) {
  const heard = await transcribeDay(day, errors);
  const messages: DayMessage[] = await db
    .select({
      chat: waMessages.chat,
      fromMe: waMessages.fromMe,
      at: waMessages.at,
      type: waMessages.type,
      body: waMessages.body,
      seconds: waMessages.seconds,
      seen: waMessages.seen,
    })
    .from(waMessages)
    .where(eq(waMessages.day, day));
  const r = await readDay(day, messages, names);
  if (!r.ok) {
    errors.push(`${day}: ${r.detail}`);
    return { day, heard, ok: false };
  }
  const row = { summary: r.summary, mood: r.mood, chats: r.chats, messages: messages.length, model: r.model, promptVersion: WA_VERSION };
  await db
    .insert(waDays)
    .values({ day, ...row })
    .onConflictDoUpdate({ target: [waDays.userId, waDays.day], set: { ...row, createdAt: new Date() } });
  return { day, heard, ok: true };
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
