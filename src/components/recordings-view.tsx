"use client";

import { useMemo, useState } from "react";

import { NoResults } from "~/components/ui/no-results";
import { ScrollArea } from "~/components/ui/scroll-area";
import type { Category } from "~/db/schema";
import {
  CATEGORY_CHIP,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatSpan,
} from "~/lib/categories";
import { cn, formatDuration } from "~/lib/utils";

export interface BoardEpisode {
  id: number;
  seq: number;
  category: Category;
  subcategory: string | null;
  confidence: number | null;
  oneLiner: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  durationSeconds: number | null;
  topics: string[] | null;
  people: string[] | null;
}

export interface BoardRecording {
  id: string;
  title: string | null;
  recordedAt: string | null;
  durationSeconds: number | null;
  language: string | null;
  transcript: string | null;
  summaryMarkdown: string | null;
  episodes: BoardEpisode[];
}

/** Categories present in a recording, most time first, with their counts. */
function summarise(eps: BoardEpisode[]): [Category, number][] {
  const seconds = new Map<Category, number>();
  const counts = new Map<Category, number>();
  for (const e of eps) {
    seconds.set(e.category, (seconds.get(e.category) ?? 0) + (e.durationSeconds ?? 0));
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (seconds.get(b[0]) ?? 0) - (seconds.get(a[0]) ?? 0))
    .map(([c, n]) => [c, n]);
}

function mmss(seconds: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The reading view: filter by category on the left, read the transcript on the
 * right, with the episodes laid over it as a strip.
 *
 * Filtering is by "has an episode in this category" rather than by a single
 * label on the recording — a call that was mostly business but spent ten
 * minutes on the kids belongs in BOTH tabs, and that is the whole point of
 * splitting them.
 */
export function RecordingsView({
  recordings,
  counts,
}: {
  recordings: BoardRecording[];
  counts: Record<string, number>;
}) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tabs = useMemo(
    () => ["all" as const, ...CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0)],
    [counts],
  );

  const visible = useMemo(() => {
    if (category === "all") {
      // `All` hides recordings that are ONLY noise or ambient: a third of the
      // corpus is hang-ups and background TV, and scrolling past those to reach
      // a conversation is the failure this tab exists to avoid. A recording
      // with even one real episode stays.
      return recordings.filter(
        (r) =>
          r.episodes.length === 0 ||
          r.episodes.some((e) => e.category !== "noise" && e.category !== "ambient"),
      );
    }
    return recordings.filter((r) => r.episodes.some((e) => e.category === category));
  }, [recordings, category]);

  const selected = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex w-full gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setCategory(t)}
            className={cn(
              "h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors",
              category === t
                ? "border border-primary bg-primary/10 text-primary shadow-sm"
                : "text-gray-500 hover:text-gray-900",
            )}
          >
            {t === "all" ? "Todas" : CATEGORY_LABELS[t]}
            <span className="ml-1.5 tabular-nums text-gray-400">
              {t === "all" ? visible.length : (counts[t] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <NoResults
          title="Aquí no hay grabaciones"
          message="Nothing in this category yet. Record something and hit Sync Pocket."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <ScrollArea className="max-h-[calc(100vh-16rem)] pr-2">
            <ul className="space-y-2">
              {visible.map((row, idx) => (
                <li
                  key={row.id}
                  className="animate-row-in"
                  style={{ animationDelay: `${Math.min(idx, 10) * 50}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "w-full rounded-2xl bg-white p-3 text-left shadow-md transition-colors",
                      selected?.id === row.id ? "ring-2 ring-amber-400" : "hover:bg-gray-50",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {row.title ?? "Sin título"}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-400">
                        {formatDuration(row.durationSeconds) ?? "—"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                      {row.episodes[0]?.oneLiner ?? "Sin procesar todavía"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      {/* One chip per CATEGORY, not per episode: a twelve-episode
                          call was rendering "Business" five times and pushing the
                          date onto a fourth line. The count carries the rest. */}
                      {summarise(row.episodes).map(([category, n]) => (
                        <span
                          key={category}
                          className={cn(
                            "rounded-full px-2 py-0.5 font-medium",
                            CATEGORY_CHIP[category],
                          )}
                        >
                          {CATEGORY_LABELS[category]}
                          {n > 1 ? <span className="ml-1 opacity-60">{n}</span> : null}
                        </span>
                      ))}
                      {row.recordedAt ? (
                        <span className="tabular-nums text-gray-400">
                          {new Date(row.recordedAt).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>

          {selected ? <Detail row={selected} /> : null}
        </div>
      )}
    </div>
  );
}

function Detail({ row }: { row: BoardRecording }) {
  return (
    <article className="animate-fade-in rounded-2xl bg-white p-4 shadow-md sm:p-6">
      <header className="border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">{row.title ?? "Sin título"}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {row.recordedAt ? (
            <span className="tabular-nums">
              {new Date(row.recordedAt).toLocaleString("es-ES", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : null}
          {formatDuration(row.durationSeconds) ? (
            <span className="tabular-nums">{formatDuration(row.durationSeconds)}</span>
          ) : null}
          {row.language ? <span className="uppercase">{row.language}</span> : null}
        </p>
      </header>

      {row.episodes.length > 0 ? (
        <section className="border-b border-gray-200 py-4">
          <h3 className="text-sm font-medium text-gray-900">
            {row.episodes.length} episodio{row.episodes.length === 1 ? "" : "s"}
          </h3>
          <ol className="mt-3 space-y-3">
            {row.episodes.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">
                  {mmss(e.startSeconds)}–{mmss(e.endSeconds)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        CATEGORY_CHIP[e.category],
                      )}
                    >
                      {CATEGORY_LABELS[e.category]}
                    </span>
                    {e.subcategory ? (
                      <span className="text-xs text-gray-500">{e.subcategory}</span>
                    ) : null}
                    <span className="text-xs tabular-nums text-gray-400">
                      {formatSpan(e.durationSeconds ?? 0)}
                    </span>
                  </div>
                  {e.oneLiner ? (
                    <p className="mt-1 text-sm text-gray-700">{e.oneLiner}</p>
                  ) : null}
                  {e.people?.length || e.topics?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[...(e.people ?? []), ...(e.topics ?? [])].map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {row.summaryMarkdown ? (
        <section className="border-b border-gray-200 py-4">
          <h3 className="text-sm font-medium text-gray-900">Summary</h3>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700">
            {row.summaryMarkdown}
          </pre>
        </section>
      ) : null}

      <section className="pt-4">
        <h3 className="text-sm font-medium text-gray-900">Transcript</h3>
        <ScrollArea className="mt-2 max-h-[40vh] pr-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {row.transcript ?? "No transcript on this recording."}
          </p>
        </ScrollArea>
      </section>
    </article>
  );
}
