"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { addDays } from "~/lib/day";
import type { Training } from "~/server/training/summary";
import { BodyMap, HeatLegend } from "./body-map";

/** On the panel: what to train today, and the body as hot as it is loaded. Everything else in «Ver todo». */
export function TrainingCard({ training, today, style }: { training: Training; today: string; style?: CSSProperties }) {
  const week = training.sessions.filter((s) => s.day > addDays(today, -7)).length;
  return (
    <Card className="p-4 animate-rise motion-reduce:animate-none" style={style}>
      <div className="flex items-center gap-3 px-2">
        <h2 className="text-sm font-medium text-gray-900">Entrenos</h2>
        <span className="text-xs text-gray-500">{week} de 7 días</span>
        <Button asChild size="toolbar" variant="outline" className="ml-auto">
          <Link href="/?ver=entrenos">Ver todo</Link>
        </Button>
      </div>
      {training.sessions.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-gray-500">Mándame un vídeo de una serie y aparece aquí</p>
      ) : (
        <>
          <p className="mt-2 px-2 text-lg font-semibold text-gray-900">{training.next.title}</p>
          <p className="mt-0.5 px-2 text-xs text-gray-500">{training.next.detail}</p>
          <BodyMap zones={training.zones} className="mx-auto mt-3 h-48 w-full max-w-xs" />
          <HeatLegend className="mt-2 justify-center" />
        </>
      )}
    </Card>
  );
}
