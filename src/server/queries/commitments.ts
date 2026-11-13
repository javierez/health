import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "~/db";
import { env } from "~/env";
import { checks, commitments, facts, whoopRecords } from "~/db/schema";
import { addDays, hm, localDay, localMinutes } from "~/lib/day";
import {
  brief,
  describe,
  freeWindows,
  bedtimeOf,
  sessionsFrom,
  standing,
  tickedLine,
  weekStart,
  type Check,
  type Standing,
} from "~/server/commitments/standing";
import { sameActivities, type CommitmentChange } from "~/server/commitments/from-chat";
import { ensureKind } from "~/server/kinds";
import { googleConfigured, listMeetings, unreadCount } from "~/server/google/client";
import { loadMembers, markRoutine } from "~/server/routines";

/** Midnight in Madrid of a `YYYY-MM-DD`, give or take the DST hour: a bound, not a label. */
const startOf = (day: string) => new Date(`${day}T00:00:00+02:00`);

/** Far enough back for a streak worth showing; this week is all the rest needs. */
const HISTORY_DAYS = 60;

export async function loadCommitments(now = new Date()): Promise<Standing[]> {
  return (await loadCommitmentsAt([now]))[0] ?? [];
}

/**
 * Where each commitment stood at several moments, from one read: «Hoy» and
 * the six days before it. A past day only had what he had set by then.
 */
export async function loadCommitmentsAt(moments: Date[]): Promise<Standing[][]> {
  const first = localDay(new Date(Math.min(...moments.map((m) => m.getTime()))));
  const since = startOf(addDays(first, -HISTORY_DAYS));
  const [list, workouts, training, drank, ticks, members] = await Promise.all([
    db.select().from(commitments).where(eq(commitments.active, true)).orderBy(asc(commitments.createdAt)),
    db
      .select()
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["workout", "sleep"]), gte(whoopRecords.startAt, since))),
    db
      .select()
      .from(facts)
      .where(and(eq(facts.kind, "training"), gte(facts.at, since))),
    db
      .select({ at: facts.at, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "meal"), gte(facts.at, since), sql`${facts.data} ? 'waterMl'`)),
    db
      .select({ day: checks.day, commitmentId: checks.commitmentId, chatMessageId: checks.chatMessageId })
      .from(checks)
      .where(gte(checks.day, addDays(first, -HISTORY_DAYS))),
    loadMembers(),
  ]);
  if (list.length === 0) return moments.map(() => []);
  const marks: Check[] = ticks.flatMap((t) =>
    t.commitmentId === null ? [] : [{ day: t.day, commitmentId: t.commitmentId, photo: t.chatMessageId !== null }],
  );

  const all = sessionsFrom(workouts.filter((w) => w.kind === "workout"), training);
  const drinks = drank.map((d) => ({ at: d.at, liters: (d.data.waterMl ?? 0) / 1000 }));
  // A nap is not going to bed.
  const nights = workouts.flatMap((w) =>
    w.kind === "sleep" && w.startAt && !(w.raw as { nap?: boolean }).nap ? [bedtimeOf(w.startAt)] : [],
  );
  return moments.map((now) =>
    list.filter((c) => c.createdAt <= now).map((c) => ({ ...standing(c, all, marks, now, nights, drinks), members: members.get(c.title) })),
  );
}

/**
 * The lines the assistant reads: where each commitment stands, and, with
 * Google connected, his meetings and gaps for the rest of the week and the
 * mail waiting. Empty when there is nothing to say.
 */
export async function commitmentLines(now: Date, all: Standing[]): Promise<string[]> {
  const lines: string[] = [];
  if (all.length > 0) {
    lines.push("\nCompromisos (los ha fijado él; [id] para cambiarlos, pararlos o darlos por hechos):");
    for (const p of all) {
      const how = p.members?.length
        ? ` (rutina: ${p.members.map((m) => m.name).join(", ")}; un toque la marca entera)`
        : p.commitment.proof === "auto" ? "" : " (lo marca él)";
      lines.push(`- [${p.commitment.id}] ${describe(p)}${p.doneToday && p.commitment.period === "week" ? ", hoy ya hecho" : ""}${how}`);
    }
  }
  if (env.APP_URL) lines.push(`Enlace a sus compromisos en el panel: ${env.APP_URL}/#compromisos`);
  if (!googleConfigured()) return lines;

  const today = localDay(now);
  const sunday = addDays(weekStart(now), 6);
  const [meetings, unread] = await Promise.all([
    listMeetings(startOf(today), startOf(addDays(sunday, 1))),
    unreadCount(),
  ]);
  if (meetings.ok) {
    lines.push("\nAgenda de lo que queda de semana (Google Calendar):");
    for (let day = today; day <= sunday; day = addDays(day, 1)) {
      const mine = meetings.data.filter((m) => localDay(m.start) === day);
      const busy = mine.reduce((sum, m) => sum + (m.end.getTime() - m.start.getTime()) / 60_000, 0);
      // Today's gaps start now: the morning already gone is not a gap.
      const gaps = freeWindows(day, meetings.data, day === today ? { from: Math.max(7 * 60, localMinutes(now)) } : {});
      lines.push(
        `- ${day}: ${mine.length} reuniones, ${hm(busy)} ocupado. Huecos de más de una hora: ${gaps.join(", ") || "ninguno"}`,
      );
    }
  }
  if (unread.ok) lines.push(`\nCorreo: ${unread.data} sin leer en la bandeja principal (7 días).`);
  return lines;
}

/**
 * What he said in the chat, applied, and the lines that confirm it. 🚨 The
 * confirmation is written here, not by the model: a commitment he made, or a
 * pill he photographed, and never saw acknowledged is one he will not trust.
 * Same after a training or a drink that counts towards one: he sees where he stands.
 *
 * A `set` with the id of one he has, or for the same activities (or, for a
 * habit, the same title) and period, changes that one: never a second
 * "Gimnasio". A habit that asks for a photo is only done by a photo.
 */
export async function noteCommitments(input: {
  changes: CommitmentChange[];
  done: number[];
  trained: boolean;
  /** He said he drank water: the water commitment shows how far he is. */
  drank: boolean;
  /** The chat message's id when it carried a photo or a video. */
  photo: number | null;
  at: Date;
}): Promise<string | null> {
  const active = await db.select().from(commitments).where(eq(commitments.active, true));
  const stopped: string[] = [];
  const touched = new Set<number>();
  const ticked = new Set<number>();

  for (const c of input.changes) {
    if (c.action === "stop") {
      const gone = active.filter((a) => a.id === c.id || a.activities.some((x) => c.activities.includes(x)));
      if (gone.length === 0) continue;
      await db.update(commitments).set({ active: false }).where(inArray(commitments.id, gone.map((g) => g.id)));
      stopped.push(...gone.map((g) => g.title));
      continue;
    }
    const same =
      active.find((a) => a.id === c.id) ??
      active.find(
        (a) =>
          a.period === c.period &&
          (c.activities.length > 0
            ? a.metric === c.metric && sameActivities(a.activities, c.activities)
            : a.activities.length === 0 && a.title.toLowerCase() === c.title.toLowerCase()),
      );
    const { action: _action, id: _id, ...values } = c;
    // A new habit («Meditar») gets its icon drawn now, after the reply.
    if (values.activities.length === 0) await ensureKind(values.title);
    if (same) {
      await db.update(commitments).set(values).where(eq(commitments.id, same.id));
      touched.add(same.id);
    } else {
      const [row] = await db.insert(commitments).values(values).returning({ id: commitments.id });
      if (row) touched.add(row.id);
    }
  }

  const day = localDay(input.at);
  for (const id of input.done) {
    const c = active.find((a) => a.id === id);
    // A bedtime is WHOOP's to say, not his; the water is what he says he drank.
    if (!c || c.metric === "bedtime" || c.metric === "liters") continue;
    await db
      .insert(checks)
      .values({ day, key: `commitment-${id}`, commitmentId: id, chatMessageId: input.photo, source: "chat" })
      .onConflictDoUpdate({ target: [checks.day, checks.key], set: { chatMessageId: input.photo } });
    await markRoutine(c.title, day, true);
    ticked.add(id);
  }

  if (touched.size === 0 && ticked.size === 0 && stopped.length === 0 && !input.trained && !input.drank) return null;
  const all = await loadCommitments(input.at);
  const quiet = touched.size === 0 && ticked.size === 0;
  const sport = (p: Standing) => p.commitment.activities.some((a) => a === "gym" || a === "run" || a === "bike");
  const shown = all.filter(
    (p) =>
      touched.has(p.commitment.id) ||
      ticked.has(p.commitment.id) ||
      (quiet && ((input.trained && sport(p)) || (input.drank && p.commitment.metric === "liters"))),
  );
  // A routine ticked has nothing to count: «Hecho. En ayunas.» read as two orders.
  const plain = (p: Standing) => ticked.has(p.commitment.id) && !touched.has(p.commitment.id) && brief(p) === p.commitment.title;
  const lines = [
    ...shown.filter((p) => !plain(p)).map((p) => `${touched.has(p.commitment.id) ? "Apuntado. " : ticked.has(p.commitment.id) ? "Hecho. " : ""}${brief(p)}.`),
    tickedLine(shown.filter(plain).map((p) => p.commitment.title)),
    ...stopped.map((t) => `Quitado: ${t}.`),
  ].filter((l): l is string => l !== null);
  return lines.length > 0 ? lines.join(" ") : null;
}

/**
 * The panel's tick: a row of «Hoy» or a commitment's day. Ticking twice
 * unticks. A commitment that asks for a photo is never ticked here: the photo
 * goes to the chat.
 */
export async function toggleCheck(input: { day: string; key: string }): Promise<{ checked: boolean } | { error: string }> {
  const id = /^commitment-(\d+)$/.exec(input.key)?.[1];
  const commitmentId = id ? Number(id) : null;
  const [c] = commitmentId === null ? [] : await db.select().from(commitments).where(eq(commitments.id, commitmentId)).limit(1);
  if (commitmentId !== null) {
    if (!c) return { error: "Ese compromiso ya no existe" };
    if (c.metric === "bedtime") return { error: "La hora de dormir la dice el WHOOP" };
    if (c.metric === "liters") return { error: "El agua se cuenta con lo que le dices al chat" };
  }
  const gone = await db
    .delete(checks)
    .where(and(eq(checks.day, input.day), eq(checks.key, input.key)))
    .returning({ id: checks.id });
  const checked = gone.length === 0;
  if (checked) await db.insert(checks).values({ day: input.day, key: input.key, commitmentId, source: "panel" }).onConflictDoNothing();
  if (c) await markRoutine(c.title, input.day, checked);
  return { checked };
}

/** What is ticked today, by key: the rows of «Hoy» read it. */
export async function checkedToday(day: string): Promise<Set<string>> {
  const rows = await db.select({ key: checks.key }).from(checks).where(eq(checks.day, day));
  return new Set(rows.map((r) => r.key));
}
