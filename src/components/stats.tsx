"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { DayBrowser } from "~/components/board";
import { Trends } from "~/components/progress-grid";
import { TrackersView } from "~/components/trackers-view";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import type { MoodDay, TrackedCategory } from "~/lib/trackers";
import type { Progress } from "~/server/queries/progress";
import type { SaludData } from "~/server/queries/salud";

/**
 * Every number, one click away and off the panel: twelve weeks of each card,
 * and day by day with its filters (Javier, 17-oct-2026: «no perder las
 * visualizaciones, pero después de un clic»).
 */
const TABS = [
  { key: "trends", label: "Evolución" },
  { key: "days", label: "Día a día" },
  { key: "tracked", label: "Lo que apuntas" },
] as const;

export function Stats({ progress, data, tracked, moods }: { progress: Progress; data: SaludData; tracked: TrackedCategory[]; moods: MoodDay[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("trends");
  return (
    <>
      <Button size="pill" variant="outline" onClick={() => setOpen(true)}>
        <BarChart3 />
        Datos
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Datos" className="w-[min(94vw,48rem)] bg-gray-50">
        <div className="mb-3 flex gap-1.5">
          {TABS.map((t) => (
            <Button
              key={t.key}
              type="button"
              size="toolbar"
              variant={tab === t.key ? "default" : "outline"}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
          {/* His trainings are history too: one tap from here, off the panel. */}
          <Button asChild size="toolbar" variant="outline">
            <Link href="/?ver=entrenos">Entrenos</Link>
          </Button>
          {/* Every WHOOP screen, off the panel too (Javier, 20-oct-2026: «no son protagonistas»). */}
          <Button asChild size="toolbar" variant="outline">
            <Link href="/?ver=whoop">WHOOP</Link>
          </Button>
          {tab === "trends" && progress.until ? <span className="ml-auto self-center text-xs text-gray-500">hasta el {progress.until}</span> : null}
        </div>
        {tab === "trends" ? <Trends progress={progress} /> : tab === "days" ? <DayBrowser data={data} /> : <TrackersView tracked={tracked} moods={moods} />}
      </Modal>
    </>
  );
}
