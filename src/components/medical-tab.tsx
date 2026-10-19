"use client";

import { useRef, useState, useTransition } from "react";

import { Days } from "~/components/day-list";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { addMedical, archiveMedical } from "~/app/actions";
import type { DayRows, MedicalRow } from "~/server/queries/salud";

const KINDS = [
  { value: "visit", label: "Consulta" },
  { value: "test", label: "Prueba" },
  { value: "diagnosis", label: "Diagnóstico" },
  { value: "medication", label: "Medicación" },
  { value: "procedure", label: "Intervención" },
  { value: "instruction", label: "Indicación del médico" },
  { value: "pending", label: "Pendiente" },
  { value: "note", label: "Nota" },
];
const LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));
const LAST = "Antecedentes";

const fecha = (day: string) => day.split("-").reverse().join("/");

/** By topic, the one with the latest entry first; background always last. */
function byTopic(entries: MedicalRow[]): [string, MedicalRow[]][] {
  const groups = new Map<string, MedicalRow[]>();
  for (const e of entries) {
    const t = e.topic ?? "Otros";
    groups.set(t, [...(groups.get(t) ?? []), e]);
  }
  const latest = (rows: MedicalRow[]) => rows.reduce((m, r) => (r.onDay && r.onDay > m ? r.onDay : m), "");
  for (const rows of groups.values()) rows.sort((a, b) => (b.onDay ?? "").localeCompare(a.onDay ?? ""));
  return [...groups].sort(([a, ra], [b, rb]) =>
    a === LAST ? 1 : b === LAST ? -1 : latest(rb).localeCompare(latest(ra)),
  );
}

function Entry({ e, onArchive }: { e: MedicalRow; onArchive: () => void }) {
  return (
    <li className="flex gap-3 py-2.5 text-sm">
      <span className="w-20 shrink-0 tabular-nums text-gray-400">{e.onDay ? fecha(e.onDay) : ""}</span>
      <details className="min-w-0 flex-1" open={e.kind === "pending"}>
        <summary className="cursor-pointer list-none">
          <span className="font-medium">{e.title}</span>
          <span className="text-gray-400"> · {LABEL[e.kind] ?? e.kind}</span>
        </summary>
        {e.details ? <p className="mt-1 leading-relaxed text-gray-600">{e.details}</p> : null}
      </details>
      <Button size="toolbar" variant="ghost" className="text-gray-400" onClick={onArchive}>
        Quitar
      </Button>
    </li>
  );
}

/** His history: what is still to do on top, then each problem from newest to oldest. The assistant reads all of it. */
export function MedicalTab({ entries, heard }: { entries: MedicalRow[]; heard: DayRows[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const archive = (id: number) => () => start(() => archiveMedical(id));

  const todo = entries.filter((e) => e.kind === "pending");
  const topics = byTopic(entries.filter((e) => e.kind !== "pending"));

  return (
    <div className="space-y-6">
      {todo.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-1">
          <h2 className="pt-2.5 text-sm font-medium text-amber-900">Pendiente</h2>
          <ul className="divide-y divide-amber-100">
            {todo.map((e) => (
              <Entry key={e.id} e={e} onArchive={archive(e.id)} />
            ))}
          </ul>
        </section>
      ) : null}

      {topics.map(([topic, rows]) => (
        <section key={topic}>
          <h2 className="text-sm font-medium">{topic}</h2>
          <ul className="divide-y divide-gray-100">
            {rows.map((e) => (
              <Entry key={e.id} e={e} onArchive={archive(e.id)} />
            ))}
          </ul>
        </section>
      ))}

      {adding ? (
        <form
          ref={form}
          action={(fd) =>
            start(async () => {
              const res = await addMedical(fd);
              setError(res.success ? null : (res.error ?? "No se guardó"));
              if (res.success) {
                form.current?.reset();
                setAdding(false);
              }
            })
          }
          className="space-y-2"
        >
          <div className="flex gap-2">
            <select
              name="kind"
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              defaultValue="visit"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <Input name="onDay" type="date" className="w-40" />
            <Input name="topic" placeholder="Tema (Cuello…)" className="w-40" />
          </div>
          <Input name="title" placeholder="Qué es (p. ej. Revisión ORL)" required />
          <Textarea name="details" placeholder="Lo que dice el informe, dosis, qué preparar…" rows={3} />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <Button type="submit" size="pill" disabled={pending}>
            Añadir
          </Button>
        </form>
      ) : (
        <Button size="pill" variant="outline" onClick={() => setAdding(true)}>
          Añadir a mano
        </Button>
      )}

      <div>
        <h2 className="mb-1 text-sm font-medium">Oído en las grabaciones</h2>
        <Days days={heard} empty="Nada médico oído todavía." />
      </div>
    </div>
  );
}
