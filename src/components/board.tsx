"use client";

import { useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "~/components/ui/button";
import { DayTimeline, type DayGroup } from "~/components/day-timeline";
import { PeriodRollup, type Period } from "~/components/period-rollup";
import { RecordingsView, type BoardRecording } from "~/components/recordings-view";
import { ScenesView } from "~/components/scenes-view";
import { formatSpan } from "~/lib/categories";
import { cn } from "~/lib/utils";
import type { Activity } from "~/server/queries/recordings";
import type { WhoopDay } from "~/server/queries/whoop";
import type { CodeDay } from "~/server/queries/code";

/**
 * 🚨 "Recordings" is last on purpose. It is the source, not the subject: what
 * this app is for is what was DONE and for how long, and a file is only where
 * that happened to be captured.
 */
type View = Period | "recordings" | "scenes";

const VIEWS: { key: View; label: string }[] = [
  { key: "day", label: "Cronología" },
  { key: "week", label: "Semanas" },
  { key: "month", label: "Meses" },
  { key: "scenes", label: "Escenas" },
  { key: "recordings", label: "Grabaciones" },
];

export function Board({
  recordings,
  activities,
  whoop,
  code,
  counts,
  lastSweptAt,
}: {
  recordings: BoardRecording[];
  activities: Activity[];
  whoop: WhoopDay[];
  code: CodeDay[];
  counts: Record<string, number>;
  lastSweptAt: string | null;
}) {
  const [view, setView] = useState<View>("day");
  const [syncing, startSync] = useTransition();

  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, Activity[]>();
    for (const a of activities) {
      const list = byDay.get(a.day) ?? [];
      list.push(a);
      byDay.set(a.day, list);
    }
    // WHOOP covers 267 days and the recorder 16, so a day with a night of
    // sleep and no recording is still a day that happened. Union, not join.
    const byWhoop = new Map(whoop.map((w) => [w.day, w]));
    const byCode = new Map(code.map((c) => [c.day, c]));
    const days = new Set([...byDay.keys(), ...byWhoop.keys(), ...byCode.keys()]);

    return [...days]
      .sort((a, b) => b.localeCompare(a))
      .map((day) => ({
        day,
        // Clock order, not file order: two recordings that straddle lunch have
        // to interleave or the rail lies about how the day ran.
        activities: (byDay.get(day) ?? []).sort(
          (x, y) => x.startsAt.getTime() - y.startsAt.getTime(),
        ),
        whoop: byWhoop.get(day) ?? null,
        code: byCode.get(day) ?? null,
      }));
  }, [activities, whoop, code]);

  const { tracked, trackedSeconds } = useMemo(() => {
    const counted = activities.filter(
      (a) => a.category !== "ambient" && a.category !== "other",
    );
    return {
      tracked: counted.length,
      trackedSeconds: counted.reduce((s, a) => s + a.durationSeconds, 0),
    };
  }, [activities]);

  function sync() {
    startSync(async () => {
      await fetch("/api/sync", { method: "POST" });
      // A sweep can add a dozen recordings and fifty episodes; a full reload is
      // the honest way to show that, and one person opens this screen.
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Salud</h1>
          <p className="mt-1 text-xs text-gray-500">
            {tracked} actividad{tracked === 1 ? "" : "es"} · {formatSpan(trackedSeconds)} registrado
            {lastSweptAt
              ? ` · sincronizado ${formatDistanceToNow(new Date(lastSweptAt), { addSuffix: true, locale: es })}`
              : null}
          </p>
        </div>
        <Button size="pill" variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {syncing ? "Sincronizando" : "Sincronizar Pocket"}
        </Button>
      </div>

      <div className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={cn(
              "h-8 shrink-0 rounded-xl px-3 text-xs font-medium transition-colors",
              view === v.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "recordings" ? (
        <RecordingsView recordings={recordings} counts={counts} />
      ) : view === "scenes" ? (
        <ScenesView activities={activities} />
      ) : view === "day" ? (
        <DayTimeline groups={groups} />
      ) : (
        <PeriodRollup activities={activities} period={view} />
      )}
    </div>
  );
}
