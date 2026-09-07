"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { CATEGORY_CHIP, CATEGORY_LABELS, formatSpan } from "~/lib/categories";
import { counterpartLabel, kindLabel } from "~/lib/taxonomy";
import { cn } from "~/lib/utils";
import type { Activity } from "~/server/queries/recordings";
import { CATEGORY_ICON, QUIET } from "~/components/activity-card";

/**
 * Everything the card leaves out. Written by hand rather than with a Dialog
 * primitive because the app has no radix dialog and this needs exactly two
 * behaviours: Escape closes, backdrop closes.
 */

function clock(d: Date): string {
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function ActivityModal({
  activity,
  onClose,
}: {
  activity: Activity | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!activity) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activity, onClose]);

  if (!activity) return null;

  const Icon = CATEGORY_ICON[activity.category];
  const quiet = QUIET.has(activity.category);
  const kind = kindLabel(activity.kind);
  const who = counterpartLabel(activity.counterpart);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="animate-row-in w-full max-w-md rounded-2xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100",
            )}
          >
            <Icon className={cn("h-4 w-4", quiet ? "text-gray-400" : "text-gray-500")} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-medium leading-4",
                  CATEGORY_CHIP[activity.category],
                )}
              >
                {CATEGORY_LABELS[activity.category]}
              </span>
              {who ? <span className="text-[10px] text-gray-400">{who}</span> : null}
            </div>
            <p className="text-base font-semibold text-gray-900">
              {kind ?? CATEGORY_LABELS[activity.category]}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-gray-500">
              {clock(activity.startsAt)}–{clock(activity.endsAt)}
              <span className="mx-1.5 text-gray-300">·</span>
              {formatSpan(activity.durationSeconds)}
              {activity.parts > 1 ? (
                <>
                  <span className="mx-1.5 text-gray-300">·</span>
                  {activity.parts} tramos seguidos
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-gray-300 transition-colors hover:text-gray-500"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {activity.oneLiner ? (
          <p className="mt-4 text-sm leading-relaxed text-gray-700">{activity.oneLiner}</p>
        ) : null}

        {activity.subcategory && activity.subcategory !== "unattributed" ? (
          <p className="mt-2 text-xs text-gray-400">{activity.subcategory}</p>
        ) : null}

        {activity.people.length > 0 ? (
          <p className="mt-4 text-sm text-gray-700">
            <span className="text-gray-400">Con </span>
            {activity.people.join(" · ")}
          </p>
        ) : null}

        {activity.topics.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {activity.topics.map((t) => (
              <span
                key={t}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {activity.recordingTitle ? (
          <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
            de “{activity.recordingTitle}”
          </p>
        ) : null}
      </div>
    </div>
  );
}
