import { and, desc, eq } from "drizzle-orm";

import { db } from "~/db";
import { facts } from "~/db/schema";
import { localClock, localDay } from "~/lib/day";
import { doneText } from "~/lib/workout";
import { sendNotice } from "~/server/assistant/whatsapp";
import { loadWorkout } from "~/server/queries/training";
import { readSyncState, writeSyncState } from "~/server/queries/sync-state";

/**
 * When he is done training, the chat sends the session's own page with
 * Pulso's score (Javier, 14-nov-2026: «una URL al acabar… verlo y darle una
 * puntuación»). Done is 20 minutes without telling it anything more; asked on
 * every push of the band (`/api/webhooks/edge`, about every ten minutes), once
 * a day (`sync_state` «training-link», the day it went).
 *
 * It waits for Pulso's hourly pulse to reach the end of the session, so the
 * score in the message is the one on the page; after two hours it goes anyway.
 */
const SOURCE = "training-link";
const QUIET_MIN = 20;
const PULSE_WAIT_MIN = 120;
const TOO_LATE_MIN = 6 * 60;

export async function doneLinkDue(now = new Date()): Promise<{ text: string } | { wait: string }> {
  const today = localDay(now);
  const [last] = await db
    .select({ at: facts.at })
    .from(facts)
    .where(and(eq(facts.kind, "training"), eq(facts.day, today)))
    .orderBy(desc(facts.at))
    .limit(1);
  if (!last) return { wait: "nada entrenado hoy" };
  const quiet = (now.getTime() - last.at.getTime()) / 60_000;
  if (quiet < QUIET_MIN) return { wait: `sigue entrenando (${Math.round(quiet)} min sin decir nada)` };
  if (quiet > TOO_LATE_MIN) return { wait: "ya es tarde para avisar" };
  if ((await readSyncState(SOURCE))?.cursorDate === today) return { wait: "ya se mandó hoy" };

  const view = await loadWorkout(today);
  if (!view || view.stats.exercises === 0) return { wait: "sin ejercicios que enseñar" };
  const end = view.session.span ? localClock(view.session.span.to) : null;
  const covered = end !== null && (view.pulse.at(-1)?.t ?? "") >= end;
  if (!covered && quiet < PULSE_WAIT_MIN) return { wait: `esperando el pulso hasta las ${end}` };
  return { text: doneText(view.stats, view.score, view.link) };
}

/** On every band push: if it is time, the message, marked first so two pushes never both send it. */
export async function sendDoneLink(now = new Date()): Promise<void> {
  const due = await doneLinkDue(now);
  if (!("text" in due)) return;
  await writeSyncState(SOURCE, { cursorDate: localDay(now) });
  const sent = await sendNotice(due.text, now);
  if (!sent.ok) console.error("[entreno] el enlace no salió", sent.detail);
}
