import { and, asc, eq, gte, inArray } from "drizzle-orm";

import { db } from "~/db";
import { env } from "~/env";
import { checks, commitments, facts, whoopRecords } from "~/db/schema";
import { addDays, hm, localDay, localMinutes } from "~/lib/day";
import {
  brief,
  dedupe,
  describe,
  factActivity,
  freeWindows,
  bedtimeOf,
  standing,
  weekStart,
  whoopActivity,
  type Check,
  type Standing,
  type Session,
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
  const since = startOf(addDays(localDay(now), -HISTORY_DAYS));
  const [list, workouts, training, ticks, members] = await Promise.all([
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
      .select({ day: checks.day, commitmentId: checks.commitmentId, chatMessageId: checks.chatMessageId })
      .from(checks)
      .where(gte(checks.day, addDays(localDay(now), -HISTORY_DAYS))),
    loadMembers(),
  ]);
  if (list.length === 0) return [];
  const marks: Check[] = ticks.flatMap((t) =>
    t.commitmentId === null ? [] : [{ day: t.day, commitmentId: t.commitmentId, photo: t.chatMessageId !== null }],
  );

  const sessions: Session[] = [
    ...workouts.flatMap((w): Session[] => {
      if (w.kind !== "workout") return [];
      const activity = whoopActivity(w.label);
      if (!activity || !w.startAt) return [];
      const meters = (w.raw as { score?: { distance_meter?: number } | null }).score?.distance_meter;
      return [
        {
          at: w.startAt,
          activity,
          km: meters ? meters / 1000 : null,
          minutes: w.durationSeconds ? Math.round(w.durationSeconds / 60) : null,
          source: "whoop",
        },
      ];
    }),
    ...training.flatMap((f): Session[] => {
      const activity = factActivity(f.data.training, f.summary);
      return activity ? [{ at: f.at, activity, km: f.data.distanceKm ?? null, minutes: null, source: "fact" }] : [];
    }),
  ];
  const all = dedupe(sessions);
  // A nap is not going to bed.
  const nights = workouts.flatMap((w) =>
    w.kind === "sleep" && w.startAt && !(w.raw as { nap?: boolean }).nap ? [bedtimeOf(w.startAt)] : [],
  );
  return list.map((c) => ({ ...standing(c, all, marks, now, nights), members: members.get(c.title) }));
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
        : p.commitment.proof === "photo" ? " (se demuestra con foto)" : p.commitment.proof === "check" ? " (lo marca él)" : "";
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
 * Same after a training that counts towards one: he sees where he stands.
 *
 * A `set` with the id of one he has, or for the same activities (or, for a
 * habit, the same title) and period, changes that one: never a second
 * "Gimnasio". A habit that asks for a photo is only done by a photo.
 */
export async function noteCommitments(input: {
  changes: CommitmentChange[];
  done: number[];
  trained: boolean;
  /** The chat message's id when it carried a photo or a video. */
  photo: number | null;
  at: Date;
}): Promise<string | null> {
  const active = await db.select().from(commitments).where(eq(commitments.active, true));
  const stopped: string[] = [];
  const touched = new Set<number>();
  const ticked = new Set<number>();
  const needPhoto: string[] = [];

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
    // A bedtime is WHOOP's to say, not his.
    if (!c || c.metric === "bedtime") continue;
    if (c.proof === "photo" && input.photo === null) {
      needPhoto.push(c.title);
      continue;
    }
    await db
      .insert(checks)
      .values({ day, key: `commitment-${id}`, commitmentId: id, chatMessageId: input.photo, source: "chat" })
      .onConflictDoUpdate({ target: [checks.day, checks.key], set: { chatMessageId: input.photo } });
    await markRoutine(c.title, day, true);
    ticked.add(id);
  }

  if (touched.size === 0 && ticked.size === 0 && stopped.length === 0 && needPhoto.length === 0 && !input.trained) return null;
  const all = await loadCommitments(input.at);
  const shown = all.filter(
    (p) =>
      touched.has(p.commitment.id) ||
      ticked.has(p.commitment.id) ||
      (input.trained && touched.size === 0 && ticked.size === 0 && p.commitment.activities.length > 0 && p.commitment.metric !== "bedtime"),
  );
  const lines = [
    ...shown.map((p) => `${touched.has(p.commitment.id) ? "Apuntado. " : ticked.has(p.commitment.id) ? "Hecho. " : ""}${brief(p)}.`),
    ...needPhoto.map((t) => `Para «${t}» necesito la foto: mándamela y lo marco.`),
    ...stopped.map((t) => `Quitado: ${t}.`),
  ];
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
    if (c.proof === "photo") return { error: "Este se demuestra con una foto por WhatsApp" };
    if (c.metric === "bedtime") return { error: "La hora de dormir la dice el WHOOP" };
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
