import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "~/db";
import { assistantMessages, chatMessages, facts, medical, whoopRecords, type Recommendation } from "~/db/schema";
import { dayTitle, hm, localClock, localDay, localMinutes } from "~/lib/day";
import { loadNights } from "~/server/assistant/context";
import { bedtimePlan, clock } from "~/server/assistant/plan";
import { describeParts, hhmm, kindOf } from "~/server/commitments/standing";
import type { Source } from "~/server/assistant/evidence";
import { loadAdvice } from "./advice";
import { checkedToday, loadCommitments } from "./commitments";
import { experimentsToday, tickKey } from "./experiments";

/**
 * The top of the board: what to do today, most urgent first. Not numbers.
 *
 * Rows that need no model: tonight's bedtime (from `plan.ts`, the same one
 * the WhatsApp alert uses), the next procedure and what is still pending in
 * the medical history. The rest is the morning note's list; until it has been
 * written, a plain training row from the day's recovery stands in.
 *
 * How a row gets done, decided here and not by him (16-oct-2026):
 * - on its own, from the data: bed (WHOOP), training (a WHOOP workout or a
 *   training he told the chat), a training commitment;
 * - with a photo or a video in the chat: meals, and a habit that asks for one;
 * - a tick, only for what nothing can show: "nada de pantallas", "pide cita".
 * The tick lives in `checks` under the row's key, so the key must not move
 * when the note is rewritten.
 */
export interface TodoRow {
  key: string;
  /** What the icon says: sleep · training · food · medical · work · gym · run · bike · habit. */
  area: string;
  /** A habit's own icon (`kindOf`), when it has one. */
  kind?: string | null;
  /** A routine: its products' icons, side by side. */
  kinds?: (string | null)[];
  title: string;
  detail: string | null;
  /** Painted amber. Only what cannot wait. */
  urgent: boolean;
  done: boolean;
  /** How it gets done: a tick, a photo or video in the chat, or on its own (null). */
  tick: "check" | "photo" | null;
  /** Advice from `evidence.ts`: the paper or guideline behind it. */
  source?: Source;
  /** Advice only: under «Haz» or under «Evita». */
  verb?: "haz" | "evita";
}

/** What the medical history says is still to ask for, for the alert on opening. */
export interface PendingItem {
  id: number;
  title: string;
  details: string | null;
  topic: string | null;
}

export interface Today {
  /** `YYYY-MM-DD`, the day the ticks are for. */
  day: string;
  date: string;
  rows: TodoRow[];
  /** "Nota de las 09:40", when the list came from the assistant. */
  source: string | null;
  pending: PendingItem[];
}

/** WHOOP's own bands: green ≥ 67, yellow 34–66, red below. */
export function trainingRow(recovery: number, trained = false): TodoRow {
  const row = { key: "training", area: "training", detail: `Recuperación ${recovery} %`, done: trained, tick: null } as const;
  if (recovery >= 67) return { ...row, title: "Hoy puedes apretar en el entreno", urgent: false };
  if (recovery >= 34) return { ...row, title: "Entreno moderado, sin ir al fallo", urgent: false };
  // A rest day leaves nothing in the data: only he can say he rested.
  return { ...row, title: "Hoy descanso o algo muy suave", urgent: true, done: false, tick: "check" };
}

const TRAINING = new Set(["training", "gym", "run", "bike"]);

/** What the data already proves today, for the note's rows. */
export interface Proven {
  trained: boolean;
  /** A meal sent to the chat as a photo or a video. */
  mealPhoto: boolean;
}

/** The same title keeps its key (and its tick) when the morning note is rewritten. */
export function itemKey(title: string): string {
  let h = 5381;
  for (const ch of title.trim().toLowerCase()) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return `item-${h.toString(36)}`;
}

export function fromItem(r: Recommendation, proven: Proven): Omit<TodoRow, "done"> & { done?: boolean } {
  const row = { key: itemKey(r.title), area: r.area, title: r.title, detail: r.detail.length > 0 ? r.detail : null, urgent: false };
  if (TRAINING.has(r.area) && !/descans/i.test(r.title)) return { ...row, tick: null, done: proven.trained };
  if (r.area === "food") return { ...row, tick: "photo", done: proven.mealPhoto };
  return { ...row, tick: "check" };
}

export async function loadToday(now = new Date()): Promise<Today> {
  const today = localDay(now);
  const [nights, [next], [note], [recovery], commitments, checked, [workout], factsToday, toAsk, trying] = await Promise.all([
    loadNights(),
    db
      .select()
      .from(medical)
      .where(and(eq(medical.active, true), eq(medical.kind, "procedure"), gte(medical.onDay, today)))
      .orderBy(asc(medical.onDay))
      .limit(1),
    db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.day, today))
      .orderBy(desc(assistantMessages.createdAt))
      .limit(1),
    db
      .select({ raw: whoopRecords.raw })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "recovery"), eq(whoopRecords.day, today)))
      .limit(1),
    loadCommitments(now),
    checkedToday(today),
    db
      .select({ id: whoopRecords.id })
      .from(whoopRecords)
      .where(and(eq(whoopRecords.kind, "workout"), eq(whoopRecords.day, today)))
      .limit(1),
    db
      .select({ kind: facts.kind, type: chatMessages.type })
      .from(facts)
      .leftJoin(chatMessages, eq(chatMessages.id, facts.chatMessageId))
      .where(and(eq(facts.day, today), inArray(facts.kind, ["training", "meal"]))),
    db
      .select()
      .from(medical)
      .where(and(eq(medical.active, true), eq(medical.kind, "pending")))
      .orderBy(asc(medical.createdAt))
      .limit(3),
    experimentsToday(today),
  ]);
  const proven: Proven = {
    trained: !!workout || factsToday.some((f) => f.kind === "training"),
    mealPhoto: factsToday.some((f) => f.kind === "meal" && (f.type === "image" || f.type === "video")),
  };

  // His cap, if he set one, goes with the bedtime row: one row about bed, not two.
  const cap = commitments.find((c) => c.commitment.metric === "bedtime");
  const plan = bedtimePlan(nights, cap?.commitment.target ?? null);
  const step = plan.bedMinutes !== plan.idealMinutes;
  const nowMin = localMinutes(now);
  const sinceBed = (nowMin - plan.bedMinutes + 1440) % 1440;
  const asleepWindow = (plan.wakeMinutes - plan.bedMinutes + 1440) % 1440;
  const late = sinceBed > 0 && sinceBed < asleepWindow;
  const toBed = (plan.bedMinutes - nowMin + 1440) % 1440;
  const rows: (Omit<TodoRow, "done"> & { done?: boolean })[] = [
    {
      key: "bed",
      area: "sleep",
      // WHOOP says when he went to bed; a tick would only be his word for it.
      tick: null,
      title: step ? `A la cama antes de las ${clock(plan.bedMinutes)}` : `A la cama a las ${clock(plan.bedMinutes)}`,
      detail: [
        late ? `Tocaba hace ${hm(sinceBed)}` : `En ${hm(toBed)}`,
        step
          ? `tu paso de esta semana; la meta, las ${clock(plan.idealMinutes)} para dormir ${hm(plan.needMinutes)}`
          : `dormir ${hm(plan.needMinutes)}, arriba a las ${clock(plan.wakeMinutes)}`,
        cap && cap.commitment.target !== plan.bedMinutes ? `tope ${hhmm(cap.commitment.target)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      urgent: late || toBed <= 40,
    },
  ];

  if (next?.onDay) {
    const inDays = Math.round((Date.parse(`${next.onDay}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    rows.push({
      key: "procedure",
      area: "medical",
      tick: "check",
      title: `${next.title} ${inDays === 0 ? "hoy" : inDays === 1 ? "mañana" : `en ${inDays} días`}`,
      detail: [dayTitle(next.onDay, today), next.details].filter(Boolean).join(" · "),
      urgent: inDays <= 3,
    });
  }

  // What the history says is still to ask for. A tick is for today; it comes
  // back tomorrow until it leaves the history ("ya tengo la cita" in the chat).
  for (const p of toAsk) {
    rows.push({ key: `medical-${p.id}`, area: "medical", tick: "check", title: p.title, detail: p.topic, urgent: true });
  }

  // A commitment when it is for today (a daily habit), needs him today, or
  // was done today: ticking it here is the same tick as in its card below.
  const doneByCommitment = new Set<string>();
  for (const c of commitments) {
    const needsHim = c.status === "behind" || c.status === "tight" || c.status === "pending";
    if (c.commitment.metric === "bedtime" || !(c.commitment.period === "day" || c.doneToday || needsHim)) continue;
    const key = `commitment-${c.commitment.id}`;
    if (c.doneToday) doneByCommitment.add(key);
    const members = c.members ?? [];
    rows.push({
      key,
      area: c.commitment.activities[0] ?? "habit",
      kind: kindOf(c.commitment),
      ...describeParts(c),
      // A routine says what goes in it: «Hyalu B5 Serum · Eye Care Cream».
      ...(members.length > 0 ? { detail: members.map((m) => m.name).join(" · "), kinds: members.map((m) => m.kind) } : {}),
      urgent: needsHim && !c.doneToday,
      tick: c.commitment.proof === "photo" ? "photo" : c.tickable ? "check" : null,
    });
  }

  // An experiment's day: ticked when he did it, then compared with its other days.
  for (const e of trying) {
    rows.push({
      key: tickKey(e.id),
      area: "habit",
      title: e.verb === "evita" ? `Hoy, evita ${e.action}` : e.action.charAt(0).toUpperCase() + e.action.slice(1),
      detail: `Prueba, día ${e.day} de ${e.days}`,
      urgent: false,
      tick: "check",
    });
  }

  const items = note?.items ?? [];
  if (items.length > 0) rows.push(...items.map((i) => fromItem(i, proven)));
  else {
    const score = (recovery?.raw as { score?: { recovery_score?: number } | null } | undefined)?.score?.recovery_score;
    if (score != null) rows.push(trainingRow(Math.round(score), proven.trained));
  }

  // Advice the data backs, after the day's list: never more than three.
  const advice = await loadAdvice(now, nights, plan.bedMinutes, commitments);
  // Something to leave has nothing to tick: it is done by not doing it.
  rows.push(...advice.map((a) => ({ ...a, urgent: false, tick: a.verb === "evita" ? null : ("check" as const) })));

  return {
    day: today,
    rows: rows.map((r) => ({
      ...r,
      done: !!r.done || doneByCommitment.has(r.key) || (!r.key.startsWith("commitment-") && checked.has(r.key)),
    })),
    date: new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(now),
    source: items.length > 0 && note ? `Nota de las ${localClock(note.createdAt)}` : null,
    pending: toAsk.map((p) => ({ id: p.id, title: p.title, details: p.details, topic: p.topic })),
  };
}
