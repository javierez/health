import { and, desc, eq, gte, inArray, notLike, sql } from "drizzle-orm";

import { db } from "~/db";
import { chatMessages, facts, medical, waMessages, whoopRecords } from "~/db/schema";
import { addDays, dayLong, hm, localClock, localDay } from "~/lib/day";
import { routineTitle } from "~/lib/routines";
import { FIBER_TARGET, MEAL_NAMES, proteinTarget, totals, totalsLine, usual } from "~/lib/food";
import { isMood, symptomsOf } from "~/lib/trackers";
import { commitmentLines, loadCommitments } from "~/server/queries/commitments";
import { loadProgress, progressLines } from "~/server/queries/progress";
import { loadWeight } from "~/server/queries/food";
import { lessonLines } from "~/server/queries/lessons";
import { loadProducts } from "~/server/queries/products";
import { loadReading } from "~/server/queries/reading";
import { loadToilet } from "~/server/queries/toilet";
import { loadTrackers } from "~/server/queries/trackers";
import { bandSilentSince, bedtimePlan, nightOver, nightsInARowUnder, quietNight, type Night } from "./plan";
import { upcoming } from "./upcoming";

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
  /** An estimated one: his usual HRV and pulse it was held against (`~/server/edge/fill`). */
  usual?: { hrv: number; rhr: number };
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
    .select({ start: whoopRecords.startAt, end: whoopRecords.endAt, raw: whoopRecords.raw, seen: whoopRecords.fetchedAt })
    .from(whoopRecords)
    .where(eq(whoopRecords.kind, "sleep"))
    .orderBy(desc(whoopRecords.startAt))
    .limit(30);
  return rows.flatMap((r) => {
    const raw = r.raw as SleepRaw;
    if (raw.nap || !r.start || !r.end) return [];
    const bed = raw.score?.stage_summary;
    const asleep = bed?.total_in_bed_time_milli ? min(bed.total_in_bed_time_milli - (bed.total_awake_time_milli ?? 0)) : null;
    return [{ start: r.start, end: r.end, seen: r.seen, needMinutes: needMinutes(raw), asleepMinutes: asleep }];
  });
}

/** When he wrote, by himself: his WhatsApp and the chat. Vesta's «Tu día» goes out from his number at 07:45 and is not him. */
async function loadOwnMessageTimes(since: Date): Promise<Date[]> {
  const [wa, chat] = await Promise.all([
    db
      .select({ at: waMessages.at })
      .from(waMessages)
      .where(and(eq(waMessages.fromMe, true), gte(waMessages.at, since), notLike(sql`coalesce(${waMessages.body}, '')`, "%Tu día%"))),
    db
      .select({ at: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.direction, "in"), gte(chatMessages.createdAt, since))),
  ]);
  return [...wa, ...chat].map((m) => m.at);
}

export async function buildContext(now: Date): Promise<string> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [whoop, recent, medicalFacts, heardMedical, file, progress, skin, month, weightKg, toilet, tracked, reading, nights, corrected] = await Promise.all([
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
    // For «Lo que viene» only, and all of them: 171 in the week to 5-nov-2026, so the 40 above
    // had lost «Cita el jueves con cirugía de la Ruber» (2-nov) by the 4th.
    db
      .select({ at: facts.at, summary: facts.summary })
      .from(facts)
      .where(and(eq(facts.kind, "medical"), gte(facts.at, new Date(now.getTime() - 14 * 86_400_000)))),
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
    loadReading(),
    loadNights(),
    lessonLines(),
  ]);

  const when = (d: Date | null) => (d ? `${localDay(d)} ${localClock(d)}` : "?");
  const lines: string[] = [`Ahora: ${dayLong(localDay(now))}, ${when(now)} (Madrid).`];

  if (corrected.length > 0) lines.push("\nLo que te ha corregido él (síguelo siempre; [id] para olvidarlo):", ...corrected);

  // The day of each thing worked out by code (`upcoming.ts`): «el lunes» heard on a Friday.
  const coming = upcoming(
    [
      ...heardMedical,
      ...file.map((m) => ({ at: m.createdAt, summary: m.details ? `${m.title}: ${m.details}` : m.title, day: m.onDay })),
    ],
    localDay(now),
  );
  lines.push("\nLo que viene, con el día ya resuelto (lo de su ficha y lo que se le oyó):", ...(coming.length > 0 ? coming : ["- Nada en los próximos 7 días."]));

  // What health worked out itself since WHOOP's subscription went (`server/edge/fill.ts`), never passed off as WHOOP's.
  const estimated = (raw: unknown) => (raw as { estimated?: boolean }).estimated === true;
  const wake = bedtimePlan(nights).wakeMinutes;
  const lastNight = whoop.find((w) => w.kind === "sleep" && !(w.raw as SleepRaw).nap);
  const silent = bandSilentSince(nights, now);
  if (silent) {
    const days = Math.floor((now.getTime() - silent.getTime()) / 86_400_000);
    lines.push(
      `\nSueño y recuperación: la banda no manda ninguna noche desde la del ${dayLong(localDay(silent))} (hace ${days} días). No sabes cómo ha recuperado ni cuánto ha dormido de verdad: no des «dormiste X», «noche corta», rachas, necesidad de sueño ni recuperación. En la nota de la mañana, siempre una línea: que abra la app de la banda (Edge) para que vuelva a mandar las noches.`,
      "Lo único que hay, sus mensajes: del último de la noche al primero de la mañana. Es lo más que pudo dormir, no lo dormido: dilo siempre con «como mucho».",
    );
    const mine = await loadOwnMessageTimes(new Date(Math.max(silent.getTime(), now.getTime() - 8 * 86_400_000)));
    for (let back = 0; back < 7; back++) {
      const wakeDay = addDays(localDay(now), -back);
      if (wakeDay <= localDay(silent)) break;
      const q = quietNight(mine, wakeDay);
      // Tonight, before his first message of the morning, is not a night yet.
      if (back === 0 && !q) continue;
      lines.push(`- Noche al ${dayLong(wakeDay)}: ${q ? `${localClock(q.from)} → ${localClock(q.to)}, como mucho ${hm(q.minutes)}` : "sin mensajes para saberlo"}`);
    }
  } else {
    lines.push("\nSueño, últimas noches:");
    const closed: (number | null)[] = [];
    for (const s of whoop.filter((w) => w.kind === "sleep")) {
      const raw = s.raw as SleepRaw;
      const bed = raw.score?.stage_summary;
      const asleep = bed?.total_in_bed_time_milli
        ? min(bed.total_in_bed_time_milli - (bed.total_awake_time_milli ?? 0))
        : null;
      const open = s === lastNight && s.endAt !== null && !nightOver(s.endAt, s.fetchedAt, wake, now);
      if (!raw.nap && !open) closed.push(asleep);
      lines.push(
        `- ${raw.nap ? "Siesta" : "Noche"} ${when(s.startAt)} a ${s.endAt ? localClock(s.endAt) : "?"}${open ? " (aún sin cerrar: es lo dormido hasta ahora, no la noche)" : ""}: dormido ${hm(asleep)}, necesitaba ${hm(needMinutes(raw))}, rendimiento ${raw.score?.sleep_performance_percentage ?? "?"} %${estimated(raw) ? " (necesidad y rendimiento estimados, sin WHOOP)" : ""}`,
      );
    }

    lines.push(`- Seguidas por debajo de 7 h, hasta la última cerrada: ${nightsInARowUnder(closed)}. Una racha, solo esta: no cuentes tú.`);

    lines.push("\nRecuperación:");
    for (const r of whoop.filter((w) => w.kind === "recovery").slice(0, 4)) {
      const { score: sc, usual } = r.raw as RecoveryRaw;
      // Edge's pulse comes with decimals: «56.233333».
      const pulse = sc?.resting_heart_rate === undefined ? "?" : Math.round(sc.resting_heart_rate);
      lines.push(
        `- ${when(r.startAt)}: ${sc?.recovery_score ?? "?"} %${estimated(r.raw) ? " (estimada, sin WHOOP)" : ""}, HRV ${sc?.hrv_rmssd_milli ? Math.round(sc.hrv_rmssd_milli) : "?"} ms, pulso en reposo ${pulse}${usual ? ` (lo suyo: HRV ${usual.hrv} ms, pulso ${usual.rhr})` : ""}`,
      );
    }
  }

  // Since 19-oct-2026 the strap goes through Edge, which detects no workout.
  const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
  const whoopOn = whoop.some((w) => (w.kind === "sleep" || w.kind === "recovery") && !w.externalId.startsWith("edge-") && w.startAt! >= threeDaysAgo);
  const workouts = whoop.filter((x) => x.kind === "workout");
  lines.push(`\nEntrenos de la semana (${whoopOn ? "WHOOP" : "la banda"}):`);
  for (const w of workouts) {
    const raw = w.raw as WorkoutRaw;
    const km = raw.score?.distance_meter ? `, ${(raw.score.distance_meter / 1000).toFixed(1)} km` : "";
    lines.push(`- ${when(w.startAt)}: ${raw.sport_name ?? "?"}, ${hm(min((w.durationSeconds ?? 0) * 1000))}, esfuerzo ${w.score?.toFixed(1) ?? "?"}${km}`);
  }
  if (!whoopOn) {
    lines.push("- La banda va sin la suscripción de WHOOP y no detecta entrenos: solo cuentan los que él cuenta en el chat. Si no ha contado ninguno, no sabes si ha entrenado: nunca digas que lleva 0, pregúntaselo.");
  } else if (workouts.length === 0) lines.push("- Ninguno.");

  lines.push("\nComidas, entrenos y peso de los 2 últimos días (oídos en las grabaciones o mandados al chat):");
  for (const f of recent) lines.push(`- [${f.id}] ${when(f.at)} ${f.summary}`);
  if (recent.length === 0) lines.push("- Nada oído.");
  const eaten = recent.filter((f) => f.kind === "meal" && f.day === localDay(now));
  const foods = eaten.flatMap((f) => f.data.foods ?? []);
  const told = Object.entries(MEAL_NAMES).flatMap(([k, name]) => (eaten.some((f) => f.data.meal === k) ? [name.toLowerCase()] : []));
  lines.push(
    eaten.length === 0
      ? "\nHoy, comida: sin datos, no ha apuntado nada. No es 0: no cuentes gramos ni lo que le falta."
      : `\nHoy lleva: ${foods.length > 0 ? totalsLine(totals(foods)) : "nada apuntado alimento a alimento"}. Apuntado: ${told.join(", ") || "nada"}.`,
  );
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
  // A week whose only night is the stale one is not this week's sleep.
  lines.push(...progressLines(progress, silent ? ["sleep", "recovery"] : []));

  if (reading) {
    lines.push(`\nLo que concluyó la lectura semanal de todos sus datos (${reading.day}): ${reading.summary}`);
    for (const r of reading.items) lines.push(`- ${r.title}: ${r.detail}`);
  }

  lines.push(...(await commitmentLines(now, await loadCommitments(now))));

  lines.push("\nSus productos:");
  for (const p of skin) {
    lines.push(`- [${p.id}] ${[p.name, p.brand, p.area, p.area === "piel" ? p.category : null, p.ingredient, routineTitle(p.moment)].filter(Boolean).join(", ")}${p.uses[0] === localDay(now) ? " (usado hoy)" : ""}${p.info?.evidence ? `. Evidencia: ${p.info.evidence.verdict}, ${p.info.evidence.line} Dosis: ${p.info.evidence.dose}` : ""}`);
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
