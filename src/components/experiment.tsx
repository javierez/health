"use client";

import { useState, useTransition } from "react";
import { AlertCircle, ChevronRight, FlaskConical } from "lucide-react";

import { endExperiment } from "~/app/actions";
import { Strip } from "~/components/finding-detail";
import { Button } from "~/components/ui/button";
import { OUTCOMES } from "~/server/insights/outcomes";
import type { ExperimentView } from "~/server/queries/experiments";

/** «Día 5 de 14 · aún pronto», or the verdict once both sides have five mornings. */
function status(e: ExperimentView) {
  const when = e.over ? "Terminada" : `Día ${e.day} de ${e.days}`;
  return `${when} · ${e.result.verdict ?? "aún pronto"}`;
}

export function ExperimentRow({ experiment: e, onOpen }: { experiment: ExperimentView; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
    >
      <FlaskConical className="size-4 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 text-sm text-gray-900">{e.title}</span>
      <span className="shrink-0 text-xs text-gray-500">{status(e)}</span>
      <ChevronRight className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
    </button>
  );
}

/** What he does on its days, both sides drawn, and «Parar». */
export function ExperimentDetail({ experiment: e, onStopped }: { experiment: ExperimentView; onStopped: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const r = e.result;
  const good = r.verdict === "Te sienta bien";
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-900">
        <b className="font-semibold">Un día sí y otro no, {e.verb === "haz" ? "haz" : "evita"}:</b> {e.action}.
      </p>
      <Strip groups={r.groups} outcome={e.outcome} tone={r.verdict === null || r.verdict === "No cambia nada" ? "gray" : good ? "dark" : "amber"} />
      <p className="text-xs leading-relaxed text-gray-500">
        {status(e)}. Marcado {r.done} de {r.due} días, medido en {OUTCOMES[e.outcome].label.toLowerCase()}.
        {r.verdict === null ? " Hacen falta cinco mañanas de cada lado." : ""}
      </p>
      {e.over ? null : (
        <div className="flex justify-end">
          <Button
            type="button"
            size="toolbar"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError("");
                const res = await endExperiment(e.id);
                if (res.success) onStopped();
                else setError(res.error);
              })
            }
          >
            Parar
          </Button>
        </div>
      )}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
