"use client";

import { useMemo } from "react";

import type { Activity } from "~/server/queries/recordings";
import { CATEGORY_FILL, CATEGORY_LABELS, CATEGORY_ORDER, formatSpan } from "~/lib/categories";
import type { Category } from "~/db/schema";
import { NoResults } from "~/components/ui/no-results";

export type Period = "day" | "week" | "month";

/**
 * ISO week key, `2026-W36`. Monday-based, because a week that starts on Sunday
 * splits every training block in half.
 */
function weekKey(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function label(period: Period, key: string): string {
  if (period === "week") {
    const [year, week] = key.split("-W");
    return `Semana ${week} · ${year}`;
  }
  if (period === "month") {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
  }
  return new Date(`${key}T00:00:00`).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Days, weeks or months as one stacked bar each.
 *
 * 🚨 `noise` AND `ambient` are excluded from every total. Both mean "the
 * recorder was on but this is not something you did" — a pocket-dial, or 25
 * minutes of Spider-Man playing in the background. Counting either as activity
 * makes the day look full of work that never happened, which is the one way
 * this screen could actively mislead.
 */
const UNCOUNTED = new Set(["noise", "ambient", "other"]);

interface Bucket {
  seconds: Record<string, number>;
  /**
   * 🚨 How MANY, not just how long. "Nine business calls and one social" is the
   * shape of a week; "8h13m business" is not — the same total is a single
   * all-day workshop or a day carved into a dozen interruptions, and those are
   * different weeks to live.
   */
  n: Record<string, number>;
  total: number;
  episodes: number;
}

export function PeriodRollup({
  activities,
  period,
}: {
  activities: Activity[];
  period: Period;
}) {
  const buckets = useMemo(() => {
    const grouped = new Map<string, Bucket>();

    for (const a of activities) {
      const key =
        period === "day" ? a.day : period === "week" ? weekKey(a.day) : a.day.slice(0, 7);
      const b = grouped.get(key) ?? { seconds: {}, n: {}, total: 0, episodes: 0 };
      if (!UNCOUNTED.has(a.category)) {
        b.seconds[a.category] = (b.seconds[a.category] ?? 0) + a.durationSeconds;
        b.n[a.category] = (b.n[a.category] ?? 0) + 1;
        b.total += a.durationSeconds;
        b.episodes += 1;
      }
      grouped.set(key, b);
    }

    return [...grouped.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .filter(([, b]) => b.total > 0);
  }, [activities, period]);

  if (buckets.length === 0) {
    return (
      <NoResults
        title="Todavía no hay nada"
        message="Sincroniza Pocket y los días se irán llenando solos."
      />
    );
  }

  // One shared scale, so a busy day looks busier than a quiet one instead of
  // every bar filling the width.
  const longest = Math.max(...buckets.map(([, b]) => b.total));

  return (
    <div className="space-y-3">
      {buckets.map(([key, bucket], idx) => (
        <div
          key={key}
          className="animate-row-in rounded-2xl bg-white p-4 shadow-md"
          style={{ animationDelay: `${Math.min(idx, 10) * 50}ms` }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium text-gray-900">{label(period, key)}</h3>
            <span className="text-xs tabular-nums text-gray-500">
              {formatSpan(bucket.total)} · {bucket.episodes} actividad
              {bucket.episodes === 1 ? "" : "es"}
            </span>
          </div>

          <div
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-gray-100"
            style={{ width: `${Math.max(8, (bucket.total / longest) * 100)}%` }}
          >
            {CATEGORY_ORDER.filter((c) => (bucket.seconds[c] ?? 0) > 0).map((c) => (
              <div
                key={c}
                className={CATEGORY_FILL[c]}
                style={{ width: `${((bucket.seconds[c] ?? 0) / bucket.total) * 100}%` }}
                title={`${CATEGORY_LABELS[c]} · ${formatSpan(bucket.seconds[c] ?? 0)}`}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {CATEGORY_ORDER.filter((c) => (bucket.seconds[c] ?? 0) > 0).map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_FILL[c as Category]}`} />
                <span className="font-medium text-gray-700 tabular-nums">{bucket.n[c] ?? 0}</span>
                <span className="text-gray-500">{CATEGORY_LABELS[c]}</span>
                <span className="tabular-nums text-gray-400">
                  {formatSpan(bucket.seconds[c] ?? 0)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
