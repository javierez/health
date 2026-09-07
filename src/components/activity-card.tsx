"use client";

import {
  Briefcase,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  Home,
  MessageCircle,
  Tv,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Category } from "~/db/schema";
import { CATEGORY_CHIP, CATEGORY_LABELS, formatSpan } from "~/lib/categories";
import { counterpartLabel, kindLabel } from "~/lib/taxonomy";
import { cn } from "~/lib/utils";
import type { Activity } from "~/server/queries/recordings";

/**
 * One activity, as a card — and only the four things needed to scan a day:
 * what kind it was, who with, how long, and whether it counts.
 *
 * The one-liner, the topics, the people and the source recording are NOT here
 * on purpose. Forty of these stack into a day, and a two-line summary on each
 * turns the rail into a wall of prose that has to be read instead of scanned.
 * They live one click away, in the modal.
 */

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  business: Briefcase,
  health: HeartPulse,
  sport: Dumbbell,
  personal: Home,
  social: MessageCircle,
  learning: GraduationCap,
  ambient: Tv,
  other: HelpCircle,
  noise: HelpCircle,
};

export const QUIET = new Set<Category>(["ambient", "other", "noise"]);

export function ActivityCard({
  activity,
  onClick,
}: {
  activity: Activity;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICON[activity.category];
  const quiet = QUIET.has(activity.category);

  const kind = kindLabel(activity.kind);
  const who = counterpartLabel(activity.counterpart);
  // The kind is the headline. Without one — the model went off-list — the
  // one-liner is promoted rather than showing a card with no title.
  const title = kind ?? activity.oneLiner ?? CATEGORY_LABELS[activity.category];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl bg-white p-3 text-left shadow-sm transition-shadow",
        !quiet && "hover:shadow-md",
        quiet && "bg-gray-50/60 shadow-none",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100",
          )}
        >
          <Icon className={cn("h-4 w-4", quiet ? "text-gray-400" : "text-gray-500")} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 text-[10px] font-medium leading-4",
                CATEGORY_CHIP[activity.category],
              )}
            >
              {CATEGORY_LABELS[activity.category]}
            </span>
            {who ? <span className="truncate text-[10px] text-gray-400">{who}</span> : null}
            {/* A merged run: five slices of one film, one card that says so. */}
            {activity.parts > 1 ? (
              <span className="shrink-0 text-[10px] text-gray-400">×{activity.parts}</span>
            ) : null}
          </div>
          <p
            className={cn(
              "truncate text-sm font-medium",
              quiet ? "text-gray-500" : "text-gray-900",
            )}
          >
            {title}
          </p>
        </div>

        <span className="shrink-0 text-xs tabular-nums text-gray-400">
          {formatSpan(activity.durationSeconds)}
        </span>
      </div>
    </button>
  );
}
