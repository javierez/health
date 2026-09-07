"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { Category } from "~/db/schema";
import { CATEGORY_FILL, CATEGORY_LABELS, formatSpan } from "~/lib/categories";
import { cn } from "~/lib/utils";
import { ActivityCard } from "~/components/activity-card";
import { ActivityModal } from "~/components/activity-modal";
import type { Activity } from "~/server/queries/recordings";
import type { WhoopDay } from "~/server/queries/whoop";
import type { CodeDay } from "~/server/queries/code";
import { WhoopWorkouts } from "~/components/whoop-strip";
import { DayGauges } from "~/components/whoop-rings";
import { CodePullRequests, CodeStrip } from "~/components/code-strip";

/**
 * 🚨 A day, as a day — not as a list of files.
 *
 * The left rail is the real clock, so a gap on this screen is an hour the
 * recorder was off rather than a rendering choice, and two recordings that
 * straddle lunch interleave instead of stacking. Every row is one ACTIVITY.
 *
 * `ambient` is drawn, quietly, but never counted: it is the recorder left on
 * during a film. Excluding it from the totals is the whole reason the category
 * exists, and drawing it anyway is what stops the gap looking like a bug.
 */
const UNCOUNTED = new Set<Category>(["ambient", "other"]);

/**
 * A counterpart of `solo` or `media` means nobody else was there, so neither
 * one is an interaction. Everything else is: this set is the whole definition
 * of "how many conversations did I have today", and it lives in one place so
 * the day, the week and the month cannot drift apart on it.
 */
const NOT_AN_INTERACTION = new Set(["solo", "media"]);

export function isInteraction(a: Activity): boolean {
  return a.counterpart !== null && !NOT_AN_INTERACTION.has(a.counterpart);
}

export interface DayGroup {
  day: string;
  activities: Activity[];
  /** Null when the band was off, or before it existed. */
  whoop: WhoopDay | null;
  /** Null on a day nothing was pushed. */
  code: CodeDay | null;
}

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function heading(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** The counts the day is judged on: how many, and how long, per category. */
export function tally(activities: Activity[]): {
  counts: { category: Category; n: number; seconds: number }[];
  activeSeconds: number;
  activeCount: number;
  /** Episodes with another human in them. The social-interaction counter. */
  interactions: number;
  /** Of those, the work ones. "How many business calls this week." */
  businessCalls: number;
} {
  const map = new Map<Category, { n: number; seconds: number }>();
  for (const a of activities) {
    const e = map.get(a.category) ?? { n: 0, seconds: 0 };
    e.n += 1;
    e.seconds += a.durationSeconds;
    map.set(a.category, e);
  }
  const counts = [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.seconds - a.seconds);

  const counted = counts.filter((c) => !UNCOUNTED.has(c.category));
  const talking = activities.filter(isInteraction);
  return {
    counts,
    activeSeconds: counted.reduce((s, c) => s + c.seconds, 0),
    activeCount: counted.reduce((s, c) => s + c.n, 0),
    interactions: talking.length,
    businessCalls: talking.filter((a) => a.category === "business").length,
  };
}

export function DayTimeline({ groups }: { groups: DayGroup[] }) {
  const [open, setOpen] = useState<string | null>(groups[0]?.day ?? null);

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        Todavía no hay nada. Sincroniza Pocket para llenar la cronología.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <DayCard
          key={g.day}
          group={g}
          open={open === g.day}
          onToggle={() => setOpen(open === g.day ? null : g.day)}
          index={i}
        />
      ))}
    </div>
  );
}

function DayCard({
  group,
  open,
  onToggle,
  index,
}: {
  group: DayGroup;
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  const { counts, activeSeconds, activeCount, interactions, businessCalls } = useMemo(
    () => tally(group.activities),
    [group.activities],
  );

  return (
    <div
      className="animate-row-in rounded-2xl bg-white shadow-md"
      style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-4 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{heading(group.day)}</p>

          {/* The two counters the app exists to answer, before any duration.
              Hidden on a day the recorder never ran: "0 llamadas" would read
              as a quiet day rather than as no data. */}
          {group.activities.length > 0 ? (
            <p className="mt-0.5 text-xs text-gray-500">
              <span className="font-medium tabular-nums text-gray-700">{businessCalls}</span>{" "}
              llamada{businessCalls === 1 ? "" : "s"} de trabajo
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="font-medium tabular-nums text-gray-700">{interactions}</span>{" "}
              interacci{interactions === 1 ? "ón" : "ones"}
            </p>
          ) : null}

          {/* The rings replace the line of text that used to say the same
              four things. They are always drawn, empty tracks included: a day
              the band was off keeps its place instead of collapsing into a
              card of a different shape. */}
          <DayGauges whoop={group.whoop} code={group.code} className="mt-2.5" />
          {group.code ? <CodeStrip code={group.code} className="mt-2" /> : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {counts.map((c) => (
              <span key={c.category} className="flex items-center gap-1.5 text-xs">
                <span className={cn("h-1.5 w-1.5 rounded-full", CATEGORY_FILL[c.category])} />
                <span
                  className={cn(
                    "font-medium",
                    UNCOUNTED.has(c.category) ? "text-gray-400" : "text-gray-700",
                  )}
                >
                  {c.n}
                </span>
                <span className="text-gray-500">{CATEGORY_LABELS[c.category]}</span>
                <span className="tabular-nums text-gray-400">{formatSpan(c.seconds)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {group.activities.length > 0 ? (
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums leading-none text-gray-900">
                {formatSpan(activeSeconds)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {activeCount} actividad{activeCount === 1 ? "" : "es"}
              </p>
            </div>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {group.whoop && group.whoop.workouts.length > 0 ? (
            <div className="mb-3">
              <WhoopWorkouts whoop={group.whoop} />
            </div>
          ) : null}
          {group.code ? (
            <div className="mb-3">
              <CodePullRequests code={group.code} />
            </div>
          ) : null}
          {group.activities.length > 0 ? (
            <Rail activities={group.activities} />
          ) : (
            <p className="py-2 text-xs text-gray-400">
              Sin grabaciones este día — solo lo que midieron la correa y GitHub.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The rail itself. Rows are already in clock order from the query; a visible
 * break is inserted wherever more than ten minutes passed with nothing
 * recorded, so the eye reads "he stopped" instead of "the next thing".
 */
const GAP_BREAK_SECONDS = 600;

function Rail({ activities }: { activities: Activity[] }) {
  // Selection lives here, not in the card: one modal per day beats forty
  // mounted-but-hidden ones.
  const [selected, setSelected] = useState<Activity | null>(null);

  return (
    <div className="space-y-1.5">
      {activities.map((a, i) => {
        const previous = activities[i - 1];
        const gap = previous
          ? (a.startsAt.getTime() - previous.endsAt.getTime()) / 1000
          : 0;

        return (
          <div key={a.id}>
            {gap > GAP_BREAK_SECONDS ? (
              <div className="flex items-center gap-3 py-2 pl-14 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-100" />
                {formatSpan(gap)} sin grabar
                <span className="h-px flex-1 bg-gray-100" />
              </div>
            ) : null}

            <div className="flex gap-3">
              <span className="w-11 shrink-0 pt-3.5 text-xs tabular-nums text-gray-400">
                {clock(a.startsAt)}
              </span>
              <div className="min-w-0 flex-1">
                <ActivityCard activity={a} onClick={() => setSelected(a)} />
              </div>
            </div>
          </div>
        );
      })}
      <ActivityModal activity={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
