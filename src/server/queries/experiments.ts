import { and, desc, eq, gte, isNull, like } from "drizzle-orm";

import { db } from "~/db";
import { checks, experiments, type Experiment } from "~/db/schema";
import { addDays, localDay } from "~/lib/day";
import { dayOf, experimentResult, isOn, type ExperimentResult } from "~/server/insights/experiments";
import { OUTCOME_KEYS, type OutcomeKey } from "~/server/insights/outcomes";
import { loadDays, loadFindings } from "~/server/queries/findings";

/** Two at a time at most: more and he stops ticking them. */
const MAX_ACTIVE = 2;
const DAYS = 14;

export interface ExperimentView {
  id: number;
  title: string;
  verb: "haz" | "evita";
  action: string;
  outcome: OutcomeKey;
  /** Day N of 14 today; 14 once over. */
  day: number;
  days: number;
  over: boolean;
  /** Today is one of its days. */
  onToday: boolean;
  result: ExperimentResult;
}

export const tickKey = (id: number) => `exp-${id}`;

/** The live ones, and those that ended in the last two months, with their result so far. */
export async function loadExperiments(now = new Date()): Promise<ExperimentView[]> {
  const today = localDay(now);
  const rows = await db
    .select()
    .from(experiments)
    .where(and(isNull(experiments.stoppedAt), gte(experiments.startDay, addDays(today, -60 - DAYS))))
    .orderBy(desc(experiments.createdAt));
  if (rows.length === 0) return [];
  const [days, ticks] = await Promise.all([
    loadDays(),
    db.select({ day: checks.day, key: checks.key }).from(checks).where(like(checks.key, "exp-%")),
  ]);
  return rows.map((e) => view(e, today, days, new Set(ticks.filter((t) => t.key === tickKey(e.id)).map((t) => t.day))));
}

function view(e: Experiment, today: string, days: Awaited<ReturnType<typeof loadDays>>, ticked: Set<string>): ExperimentView {
  const over = addDays(e.startDay, e.days) <= today;
  const labels: [string, string] = [e.verb === "haz" ? "Los días que lo hiciste" : "Los días que lo evitaste", "Los demás días"];
  return {
    id: e.id,
    title: e.title,
    verb: e.verb,
    action: e.action,
    outcome: e.outcome as OutcomeKey,
    day: dayOf(e, today),
    days: e.days,
    over,
    onToday: isOn(e, today) === true,
    result: experimentResult(e, days, ticked, labels),
  };
}

/** For «Hoy»: the live ones whose day today is, without reading a year of days. */
export async function experimentsToday(today: string): Promise<{ id: number; verb: "haz" | "evita"; action: string; day: number; days: number }[]> {
  const rows = await db.select().from(experiments).where(and(isNull(experiments.stoppedAt), gte(experiments.startDay, addDays(today, -DAYS))));
  return rows.filter((e) => isOn(e, today) === true).map((e) => ({ id: e.id, verb: e.verb, action: e.action, day: dayOf(e, today), days: e.days }));
}

/**
 * Starts one from a finding, by its key and outcome: what to do comes from
 * the engine, never from the browser. Returns an error a person can read.
 */
export async function startExperiment(findingKey: string, outcome: string, now = new Date()): Promise<{ error: string } | { id: number }> {
  if (!(OUTCOME_KEYS as readonly string[]).includes(outcome)) return { error: "No sé qué medir con eso." };
  const found = await loadFindings();
  const f = Object.values(found.by[outcome as OutcomeKey])
    .flat()
    .find((x) => x.key === findingKey);
  if (!f?.todo || !f.controllable) return { error: "Esto no se puede probar día a día." };
  const live = (await loadExperiments(now)).filter((e) => !e.over);
  if (live.some((e) => e.title === f.title)) return { error: "Ya lo estás probando." };
  if (live.length >= MAX_ACTIVE) return { error: `Ya tienes ${MAX_ACTIVE} pruebas en marcha: termina una antes.` };
  const [row] = await db
    .insert(experiments)
    .values({ findingKey, outcome, title: f.title, verb: f.todo.verb, action: f.todo.action, startDay: localDay(now), days: DAYS })
    .returning({ id: experiments.id });
  return { id: row!.id };
}

export async function stopExperiment(id: number) {
  await db.update(experiments).set({ stoppedAt: new Date() }).where(eq(experiments.id, id));
}
