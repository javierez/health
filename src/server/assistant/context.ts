import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "~/db";
import { facts, medical, whoopRecords } from "~/db/schema";
import { hm, localClock, localDay } from "~/lib/day";
import { routineTitle } from "~/lib/routines";
import { FIBER_TARGET, MEAL_NAMES, proteinTarget, totals, totalsLine, usual } from "~/lib/food";
import { isMood, symptomsOf } from "~/lib/trackers";
import { commitmentLines, loadCommitments } from "~/server/queries/commitments";
import { loadProgress, progressLines } from "~/server/queries/progress";
import { loadWeight } from "~/server/queries/food";
import { loadProducts } from "~/server/queries/products";
import { loadToilet } from "~/server/queries/toilet";
import { loadTrackers } from "~/server/queries/trackers";
import type { Night } from "./plan";

/**
 * Everything the assistant knows when it writes, as plain lines. Read fresh on
 * every message; nothing here is cached, because the point is that it reflects
 * the dinner from an hour ago.
 */
export interface SleepRaw {
  nap?: boolean;
  score?: {
    sleep_performance_percentage?: number;
    stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
  } | null;
}

interface RecoveryRaw {
  score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number } | null;
}

interface WorkoutRaw {
  sport_name?: string | null;
  score?: { strain?: number; distance_meter?: number; average_heart_rate?: number } | null;
}

const min = (ms: number | undefined) => (ms === undefined ? null : Math.round(ms / 60_000));

export function needMinutes(raw: SleepRaw): number | null {
  const n = raw.score?.sleep_needed;
  if (!n?.baseline_milli) return null;
  return min(
    n.baseline_milli +
      (n.need_from_sleep_debt_milli ?? 0) +
      (n.need_from_recent_strain_milli ?? 0) -
      (n.need_from_recent_nap_milli ?? 0),
  );
}

/** The nights, naps left out: a 20-minute nap is not when he wakes up. */
export async function loadNights(): Promise<Night[]> {
  const rows = await db
    .select({ start: whoopRecords.startAt, end: whoopRecords.endAt, raw: whoopRecords.raw })
    .from(whoopRecords)
    .where(eq(whoopRecords.kind, "sleep"))
    .orderBy(desc(whoopRecords.startAt))
    .limit(30);
  return rows.flatMap((r) => {
    const raw = r.raw as SleepRaw;
    if (raw.nap || !r.start || !r.end) return [];
    const bed = raw.score?.stage_summary;
    const asleep = bed?.total_in_bed_time_milli ? min(bed.total_in_bed_time_milli - (bed.total_awake_time_milli ?? 0)) : null;
    return [{ start: r.start, end: r.end, needMinutes: needMinutes(raw), asleepMinutes: asleep }];
  });
}

export async function buildContext(now: Date): Promise<string> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [whoop, recent, medicalFacts, file, progress, skin, month, weightKg, toilet, tracked] = await Promise.all([
    db
      .select()
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["sleep", "recovery", "workout", "cycle"]), gte(whoopRecords.startAt, weekAgo)))
      .orderBy(desc(whoopRecords.startAt)),
    db
      .select()
      .from(facts)
      .where(and(inArray(facts.kind, ["meal", "training", "body", "other"]), gte(facts.at, new Date(now.getTime() - 2 * 86_400_000))))
      .orderBy(desc(facts.at)),
    db
      .select()
      .from(facts)
      .where(and(eq(facts.kind, "medical"), gte(facts.at, monthAgo)))
      .orderBy(desc(facts.at))
      .limit(40),
    db.select().from(medical).where(eq(medical.active, true)).orderBy(desc(medical.onDay)),
    loadProgress(now),
    loadProducts(now),
    db
      .select({ id: facts.id, data: facts.data })
      .from(facts)
      .where(and(eq(facts.kind, "meal"), gte(facts.at, monthAgo)))
      .orderBy(desc(facts.at)),
    loadWeight(),
    loadToilet(now),
    loadTrackers(90, now),
  ]);

  const when = (d: Date | null) => (d ? `${localDay(d)} ${localClock(d)}` : "?");
  const lines: string[] = [`Ahora: ${when(now)} (Madrid).`];

  lines.push("\nSueño, últimas noches:");
  for (const s of whoop.filter((w) => w.kind === "sleep")) {
    const raw = s.raw as SleepRaw;
    const bed = raw.score?.stage_summary;
    const asleep = bed?.total_in_bed_time_milli
      ? min(bed.total_in_bed_time_milli - (bed.total_awake_time_milli ?? 0))
      : null;
    lines.push(
      `- ${raw.nap ? "Siesta" : "Noche"} ${when(s.startAt)} a ${s.endAt ? localClock(s.endAt) : "?"}: dormido ${hm(asleep)}, necesitaba ${hm(needMinutes(raw))}, rendimiento ${raw.score?.sleep_performance_percentage ?? "?"} %`,
    );
  }

  lines.push("\nRecuperación:");
  for (const r of whoop.filter((w) => w.kind === "recovery").slice(0, 4)) {
    const sc = (r.raw as RecoveryRaw).score;
    lines.push(
      `- ${when(r.startAt)}: ${sc?.recovery_score ?? "?"} %, HRV ${sc?.hrv_rmssd_milli ? Math.round(sc.hrv_rmssd_milli) : "?"} ms, pulso en reposo ${sc?.resting_heart_rate ?? "?"}`,
    );
  }

  lines.push("\nEntrenos de la semana (WHOOP):");
  for (const w of whoop.filter((x) => x.kind === "workout")) {
    const raw = w.raw as WorkoutRaw;
    const km = raw.score?.distance_meter ? `, ${(raw.score.distance_meter / 1000).toFixed(1)} km` : "";
    lines.push(`- ${when(w.startAt)}: ${raw.sport_name ?? "?"}, ${hm(min((w.durationSeconds ?? 0) * 1000))}, esfuerzo ${w.score?.toFixed(1) ?? "?"}${km}`);
  }

  lines.push("\nComidas, entrenos y peso de los 2 últimos días (oídos en las grabaciones o mandados al chat):");
  for (const f of recent) lines.push(`- [${f.id}] ${when(f.at)} ${f.summary}`);
  if (recent.length === 0) lines.push("- Nada oído.");
  const eaten = recent.filter((f) => f.kind === "meal" && f.day === localDay(now));
  const foods = eaten.flatMap((f) => f.data.foods ?? []);
  const told = Object.entries(MEAL_NAMES).flatMap(([k, name]) => (eaten.some((f) => f.data.meal === k) ? [name.toLowerCase()] : []));
  lines.push(`\nHoy lleva: ${foods.length > 0 ? totalsLine(totals(foods)) : "nada apuntado alimento a alimento"}. Apuntado: ${told.join(", ") || "nada"}.`);
  // Asked every night (`write.ts`): only while today's is not told.
  const day = recent.filter((f) => f.day === localDay(now));
  const mood = day.find((f) => isMood(f.data));
  const ills = day.flatMap((f) => symptomsOf(f.kind, f.data, f.summary));
  lines.push(`Hoy, ánimo: ${mood ? mood.summary : "sin apuntar"}. Síntomas: ${ills.join(", ") || (mood ? "ninguno" : "sin apuntar")}.`);
  lines.push(`Su objetivo al día: ${proteinTarget(weightKg)} g de proteína (1,6 g por kg, pesa ${weightKg} kg) y ${FIBER_TARGET} g de fibra.`);

  const meals = month.map((m) => ({ id: m.id, ...m.data }));
  const byId = new Map(meals.map((m) => [m.id, m]));
  lines.push("\nLo de siempre (lo que repite en 30 días; para copiarlo, like con su [id]):");
  const repeated = usual(meals);
  for (const u of repeated) {
    const m = byId.get(u.id)!;
    lines.push(`- [${u.id}] ${MEAL_NAMES[m.meal ?? ""] ?? "Comida"}: ${m.foods!.map((f) => f.name).join(", ")} (${u.times} veces)`);
  }
  if (repeated.length === 0) lines.push("- Aún nada repetido.");

  lines.push("\nLo que apunta, por categoría (90 días; «suya» = una categoría que ha creado él):");
  for (const c of tracked) {
    const types = c.types.map((t) => `${t.name} ${t.times === 1 ? "1 vez" : `${t.times} veces`}, la última ${t.last}${t.lastValue ? ` (${t.lastValue})` : ""}`);
    lines.push(`- ${c.category}${c.own ? " (suya)" : ""}: ${types.join(" · ")}`);
  }
  if (tracked.length === 0) lines.push("- Nada aún.");

  lines.push("\nBaño, por días (de noche = de 00:00 a 06:00):");
  for (const d of toilet.days) lines.push(`- ${d.day}: ${d.line}`);
  if (toilet.days.length === 0) lines.push("- Nada apuntado.");
  for (const t of toilet.today) lines.push(`- Hoy [${t.id}] ${t.time} ${t.toilet === "pee" ? "pis" : "caca"}${t.detail ? `, ${t.detail}` : ""}`);

  lines.push(`\nCómo va, por semanas (la última termina el ${progress.anchor}):`);
  lines.push(...progressLines(progress));

  lines.push(...(await commitmentLines(now, await loadCommitments(now))));

  lines.push("\nSus productos:");
  for (const p of skin) {
    lines.push(`- [${p.id}] ${[p.name, p.brand, p.area, p.area === "piel" ? p.category : null, p.ingredient, routineTitle(p.moment)].filter(Boolean).join(", ")}${p.uses[0] === localDay(now) ? " (usado hoy)" : ""}`);
  }
  if (skin.length === 0) lines.push("- Ninguno.");

  lines.push("\nHistoria médica (pending = lo que falta pedir o hacer):");
  for (const m of file) {
    lines.push(`- [${[m.topic, m.kind, m.onDay].filter(Boolean).join(", ")}] ${m.title}${m.details ? `: ${m.details}` : ""}`);
  }
  if (file.length === 0) lines.push("- Vacía.");

  lines.push("\nLo médico de los 30 últimos días (grabaciones y chat):");
  for (const f of medicalFacts) lines.push(`- ${when(f.at)} ${f.summary}`);
  if (medicalFacts.length === 0) lines.push("- Nada oído.");

  return lines.join("\n");
}
