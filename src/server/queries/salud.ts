import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "~/db";
import { facts, medical, whoopRecords } from "~/db/schema";
import { env } from "~/env";
import { formatSpan } from "~/lib/categories";
import { addDays, dayTitle, hm, localClock, localDay } from "~/lib/day";
import { GROUPS, type GroupKey } from "~/lib/day-groups";
import { kindLabel } from "~/lib/taxonomy";
import { sportName } from "~/lib/sports";
import { needMinutes, type SleepRaw } from "~/server/assistant/context";
import { listCodeDays } from "./code";
import { listActivities } from "./recordings";
import { whatsappDays, whatsappPattern, type WaPattern } from "./whatsapp";

/**
 * Everything the screen shows, already as text, on Madrid's clock so the
 * server (UTC) and the browser never disagree about what time dinner was.
 *
 * A day is a card of groups (Sueño, Entreno, Comidas…): each one a line that
 * says it all, and the detail underneath for when he wants it.
 */
export interface Row {
  time: string;
  label: string;
  text: string;
}
/** The medical file's "heard" list still reads days as plain rows. */
export interface DayRows {
  day: string;
  title: string;
  rows: Row[];
}
export interface MedicalRow {
  id: number;
  kind: string;
  title: string;
  details: string | null;
  onDay: string | null;
  topic: string | null;
}

export interface Group {
  key: GroupKey;
  summary: string;
  rows: Row[];
}
export interface DayCard {
  day: string;
  title: string;
  /** "78,4 kg", when he weighed himself that day. */
  weight: string | null;
  groups: Group[];
}
export interface SaludData {
  days: DayCard[];
  medical: MedicalRow[];
  heard: DayRows[];
  /** Does a tense day on WhatsApp cost him the next morning, and which topics come tense. */
  pattern: WaPattern;
}


/** One thing that happened, before it is grouped. `short` is what it adds to its group's line. */
interface Item {
  day: string;
  at: number;
  group: GroupKey;
  row: Row;
  short?: string;
  seconds?: number;
  kcal?: number;
}

const num = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");
const unique = (list: string[]) => [...new Set(list)];
/** "Desayuno, comida y cena". */
function sentence(list: string[]): string {
  const [first, ...rest] = list.map((s, i) => (i === 0 ? s : s.toLowerCase()));
  if (!first) return "";
  return rest.length === 0 ? first : `${[first, ...rest.slice(0, -1)].join(", ")} y ${rest.at(-1)}`;
}
const seconds = (list: Item[]) => list.reduce((s, i) => s + (i.seconds ?? 0), 0);

/** Each group's one line, from its items. */
const TOILET = "Baño";

const SUMMARY: Record<Exclude<GroupKey, "whatsapp">, (list: Item[]) => string> = {
  sleep: (l) => l.map((i) => i.short ?? i.row.text).join(" · "),
  training: (l) => unique(l.map((i) => i.short ?? i.row.label)).join(" · "),
  meals: (l) => {
    const kcal = l.reduce((s, i) => s + (i.kcal ?? 0), 0);
    const names = sentence(unique(l.map((i) => i.row.label)));
    return kcal > 0 ? `${names} · unas ${Math.round(kcal).toLocaleString("es-ES")} kcal` : names;
  },
  work: (l) => {
    const heard = seconds(l);
    return [heard > 0 ? `${formatSpan(heard)} en grabaciones` : null, ...l.flatMap((i) => i.short ?? [])].filter(Boolean).join(" · ");
  },
  life: (l) => `${formatSpan(seconds(l))} · ${sentence(unique(l.map((i) => i.row.label)).slice(0, 3))}`,
  medical: (l) => {
    const said = l.filter((i) => i.short !== TOILET);
    const loo = l.length - said.length;
    return [
      said.length === 0 ? null : said.length === 1 ? said[0]!.row.text : `${said[0]!.row.text} y ${said.length - 1} más`,
      loo > 0 ? `${TOILET} ${loo === 1 ? "1 vez" : `${loo} veces`}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  },
};

interface WhoopRaw {
  nap?: boolean;
  sport_name?: string | null;
  score?: {
    sleep_performance_percentage?: number;
    stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number };
    recovery_score?: number;
    strain?: number;
    distance_meter?: number;
    average_heart_rate?: number;
  } | null;
}

/** The days with something, newest first: a month of them. */
const DAYS = 30;

export async function loadSalud(now = new Date()): Promise<SaludData> {
  const today = localDay(now);
  // The latest days WITH something, not the last calendar days: after a gap
  // in the syncs the screen still shows the last real days instead of nothing.
  const since = new Date(now.getTime() - 120 * 86_400_000);

  const [activities, factRows, whoop, code, file, chats, pattern] = await Promise.all([
    listActivities({ limit: 3000 }),
    db.select().from(facts).where(gte(facts.at, since)).orderBy(desc(facts.at)),
    db
      .select()
      .from(whoopRecords)
      .where(and(inArray(whoopRecords.kind, ["sleep", "recovery", "workout"]), gte(whoopRecords.startAt, since))),
    // His own commits only: this is his diary. Gonzalo's are in the weekly card.
    listCodeDays(env.GITHUB_LOGIN ?? "javierez"),
    db.select().from(medical).where(eq(medical.active, true)).orderBy(desc(medical.onDay), desc(medical.createdAt)),
    whatsappDays(addDays(today, -60)),
    whatsappPattern(),
  ]);

  const recoveryByDay = new Map(
    whoop
      .filter((w) => w.kind === "recovery" && w.day)
      .map((w) => [w.day!, (w.raw as WhoopRaw).score?.recovery_score ?? null]),
  );

  const sleep: Item[] = whoop
    .filter((w) => w.kind === "sleep" && w.startAt && w.endAt && !(w.raw as WhoopRaw).nap)
    .map((w) => {
      const raw = w.raw as WhoopRaw;
      const bed = raw.score?.stage_summary;
      const asleep = bed?.total_in_bed_time_milli
        ? Math.round((bed.total_in_bed_time_milli - (bed.total_awake_time_milli ?? 0)) / 60_000)
        : null;
      const wakeDay = localDay(w.endAt!);
      const recovery = recoveryByDay.get(wakeDay);
      return {
        day: wakeDay,
        at: w.endAt!.getTime(),
        group: "sleep",
        short: [`${hm(asleep)} dormido`, recovery != null ? `recuperación ${recovery} %` : null].filter(Boolean).join(", "),
        row: {
          time: localClock(w.endAt!),
          label: "Noche",
          text: [
            `${localClock(w.startAt!)} a ${localClock(w.endAt!)}`,
            `${hm(asleep)} dormido`,
            `necesitabas ${hm(needMinutes(w.raw as SleepRaw))}`,
            raw.score?.sleep_performance_percentage != null ? `${raw.score.sleep_performance_percentage} %` : null,
            recovery != null ? `recuperación ${recovery} %` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      };
    });

  const workouts: Item[] = whoop
    .filter((w) => w.kind === "workout" && w.startAt)
    .map((w) => {
      const raw = w.raw as WhoopRaw;
      const sport = sportName(raw.sport_name ?? w.label ?? "");
      const km = raw.score?.distance_meter ? `${num(raw.score.distance_meter / 1000)} km` : null;
      return {
        day: localDay(w.startAt!),
        at: w.startAt!.getTime(),
        group: "training",
        short: `${sport} ${km ?? formatSpan(w.durationSeconds ?? 0)}`,
        row: {
          time: localClock(w.startAt!),
          label: sport,
          text: [
            formatSpan(w.durationSeconds ?? 0),
            km,
            w.score != null ? `esfuerzo ${num(w.score)}` : null,
            raw.score?.average_heart_rate ? `${raw.score.average_heart_rate} ppm` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      };
    });

  // The summaries read "Comida: lentejas…", "Gimnasio: sentadilla…": the part
  // before the colon is the label, so it is not said twice on the line.
  const fact = (kind: string, label: string, group: GroupKey): Item[] =>
    factRows
      .filter((f) => f.kind === kind)
      .map((f) => {
        const [head, ...rest] = f.summary.split(": ");
        const split = rest.length > 0 && (head?.length ?? 0) <= 20;
        return {
          day: f.day,
          at: f.at.getTime(),
          group,
          kcal: f.data.kcal,
          // "Gimnasio" from "Gimnasio: sentadilla…"; the whole line when it has no head ("Press banca 1×8 a 80 kg").
          short: split ? head : f.summary,
          row: {
            time: localClock(f.at),
            label: split ? (head ?? label) : label,
            text: split ? rest.join(": ") : f.summary,
          },
        };
      });
  const meals = fact("meal", "Comida", "meals");
  const trained = fact("training", "Entreno", "training");
  const heard = fact("medical", "Médico", "medical");
  const other = fact("other", "Otro", "life");
  // Each time he goes to the toilet, whole («Pis: escozor»), with the medical: no card of its own.
  const toilet: Item[] = factRows
    .filter((f) => f.kind === "toilet")
    .map((f) => ({ day: f.day, at: f.at.getTime(), group: "medical", short: TOILET, row: { time: localClock(f.at), label: TOILET, text: f.summary } }));

  // What he weighs goes by the day's title, not in a group of its own.
  const weight = new Map<string, string>();
  for (const f of factRows.filter((f) => f.kind === "body")) {
    if (weight.has(f.day)) continue;
    const kg = f.data.weightKg;
    weight.set(f.day, kg ? `${num(kg)} kg` : f.summary);
  }

  // Business is work; everything else he lived, heard by the Pocket, is "Vida".
  const lived: Item[] = activities
    .filter((a) => a.startsAt >= since && !["ambient", "other", "noise"].includes(a.category))
    .map((a) => ({
      day: a.day,
      at: a.startsAt.getTime(),
      group: a.category === "business" ? "work" : "life",
      seconds: a.durationSeconds,
      row: {
        time: localClock(a.startsAt),
        label: kindLabel(a.kind) ?? (a.category === "business" ? "Trabajo" : "Vida"),
        text: `${a.oneLiner ?? ""} · ${formatSpan(a.durationSeconds)}`,
      },
    }));

  const coded: Item[] = code
    .filter((c) => c.day >= localDay(since) && c.commits > 0)
    .map((c) => ({
      day: c.day,
      at: Date.parse(`${c.day}T23:59:00Z`),
      group: "work",
      short: `${c.commits} ${c.commits === 1 ? "commit" : "commits"}`,
      row: { time: "", label: "Código", text: `${c.commits} ${c.commits === 1 ? "commit" : "commits"} · +${c.additions} −${c.deletions}` },
    }));

  const items = [...sleep, ...workouts, ...trained, ...meals, ...other, ...lived, ...coded, ...heard, ...toilet];
  const dayKeys = unique([...items.map((i) => i.day), ...chats.keys(), ...weight.keys()])
    .sort((a, b) => b.localeCompare(a))
    .slice(0, DAYS);

  const days = dayKeys.map((day) => {
    const mine = items.filter((i) => i.day === day);
    const groups = GROUPS.flatMap(({ key }): Group[] => {
      if (key === "whatsapp") {
        const wa = chats.get(day);
        return wa ? [{ key, ...wa }] : [];
      }
      const list = mine.filter((i) => i.group === key).sort((a, b) => a.at - b.at);
      return list.length > 0 ? [{ key, summary: SUMMARY[key](list), rows: list.map((i) => i.row) }] : [];
    });
    return { day, title: dayTitle(day, today), weight: weight.get(day) ?? null, groups };
  });

  const heardDays = unique(heard.map((h) => h.day))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, DAYS)
    .map((day) => ({
      day,
      title: dayTitle(day, today),
      rows: heard.filter((h) => h.day === day).sort((a, b) => a.at - b.at).map((h) => h.row),
    }));

  return {
    days,
    medical: file.map((m) => ({ id: m.id, kind: m.kind, title: m.title, details: m.details, onDay: m.onDay, topic: m.topic })),
    heard: heardDays,
    pattern,
  };
}
