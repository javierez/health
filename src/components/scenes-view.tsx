"use client";

import { useMemo, useState } from "react";

import { SceneStage } from "~/components/scene-stage";
import { CATEGORY_LABELS } from "~/lib/categories";
import { KINDS } from "~/lib/taxonomy";
import { cn } from "~/lib/utils";
import type { ModelCategory } from "~/db/schema";
import type { Activity } from "~/server/queries/recordings";

/**
 * A scene per kind, generated on first view and stored forever.
 *
 * Only the kinds that actually happened get a card: generating art for an
 * activity nobody has ever done is spending money on a blank week. They are
 * ordered by how much of the corpus they account for, so the first thing drawn
 * is the thing most done.
 */
export function ScenesView({ activities }: { activities: Activity[] }) {
  const [live, setLive] = useState<string[]>([]);

  const rows = useMemo(() => {
    const seen = new Map<string, { n: number; seconds: number }>();
    for (const a of activities) {
      if (!a.kind) continue;
      const slug = `${a.category}:${a.kind}`;
      const e = seen.get(slug) ?? { n: 0, seconds: 0 };
      e.n += 1;
      e.seconds += a.durationSeconds;
      seen.set(slug, e);
    }
    return [...seen.entries()]
      .map(([slug, v]) => {
        const [category, kind] = slug.split(":") as [ModelCategory, string];
        return {
          slug,
          category,
          label: KINDS[category]?.find((t) => t.value === kind)?.label ?? kind,
          ...v,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);
  }, [activities]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Una animación por tipo de actividad, escrita por Fable la primera vez que
        se ve y guardada. {rows.length} tipos en el corpus.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const on = live.includes(r.slug);
          return (
            <div key={r.slug} className="rounded-2xl bg-white p-3 shadow-md">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-gray-900">{r.label}</p>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
                  {CATEGORY_LABELS[r.category]}
                </span>
              </div>
              {on ? (
                <SceneStage slug={r.slug} className="[&_canvas]:h-40" />
              ) : (
                <button
                  type="button"
                  onClick={() => setLive((v) => [...v, r.slug])}
                  className={cn(
                    "flex h-40 w-full items-center justify-center rounded-2xl",
                    "bg-gray-50 text-xs text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-700",
                  )}
                >
                  Dibujar
                </button>
              )}
              <p className="mt-2 text-xs text-gray-500">
                <span className="font-medium tabular-nums text-gray-700">{r.n}</span> veces
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
