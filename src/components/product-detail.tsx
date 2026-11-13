"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Info } from "lucide-react";

import { markUsed } from "~/app/actions";
import { Button } from "~/components/ui/button";
import type { ProductArea } from "~/db/schema";
import { addDays } from "~/lib/day";
import { routineOf, SKIN_EVIDENCE, whenText, type SkinEvidence } from "~/lib/skin";
import { cn } from "~/lib/utils";
import type { Standing } from "~/server/commitments/standing";
import type { ProductView } from "~/server/queries/products";
import { Render } from "./tick";
import { MiniWeek } from "./week-card";

export const AREA: Record<ProductArea, string> = { piel: "Piel", suplemento: "Suplemento" };

/**
 * One product: its icon, «Lo he usado hoy», the last two weeks, and its card
 * from the web (what it is, what does what, what to watch, how). A cream
 * also gets its routine and what the evidence says.
 */
export function ProductDetail({ p, list, today }: { p: ProductView; list: Standing[]; today: string }) {
  const routine = routineOf(p, list);
  const info = p.info;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Render area="habit" title={p.name} kind={p.kind} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-700">
            {[p.brand, AREA[p.area], p.spf ? `SPF ${p.spf}` : null, p.ingredient].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-gray-500">{p.area === "piel" || p.moment ? (whenText(p, routine) ?? "Aún sin rutina: dímelo en el chat") : used(p)}</p>
        </div>
        {routine ? <MiniWeek s={routine} today={today} /> : null}
      </div>

      <Uses p={p} today={today} />

      {info ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-900">{info.summary}</p>
          {info.evidence ? (
            <Section label="Lo que dice la evidencia">
              <p className="text-sm text-gray-700">
                <b className="font-medium text-gray-900">{info.evidence.verdict.charAt(0).toUpperCase() + info.evidence.verdict.slice(1)}</b>. {info.evidence.line}
              </p>
              {info.evidence.dose ? <p className="mt-0.5 text-xs text-gray-500">{info.evidence.dose}</p> : null}
            </Section>
          ) : null}
          {info.actives.length > 0 ? (
            <Section label="Lo que hace">
              <ul className="space-y-1">
                {info.actives.map((a) => (
                  <li key={a.name} className="text-sm text-gray-700">
                    <b className="font-medium text-gray-900">{a.name}</b>: {a.does}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {info.cautions.length > 0 ? (
            <Section label="Ojo con">
              <ul className="space-y-1">
                {info.cautions.map((c) => (
                  <li key={c} className="flex gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    {c}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {info.use ? (
            <Section label="Cómo">
              <p className="text-sm text-gray-700">{info.use}</p>
            </Section>
          ) : null}
          {info.ingredients.length > 0 ? <Ingredients list={info.ingredients} /> : null}
          {info.sources.length > 0 ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
              {info.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {s.title}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500">{p.infoStatus === "failed" ? "No encontré su ficha en internet." : "Buscando su ficha en internet…"}</p>
      )}

      {p.area === "piel" ? (
        <Section label="Lo que dice la evidencia">
          <ul className="divide-y divide-gray-100">
            {SKIN_EVIDENCE.filter((e) => !e.for || e.for.includes(p.category)).map((e) => (
              <Evidence key={e.title} e={e} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

const used = (p: ProductView) => (p.uses.length === 0 ? "Aún sin usar" : `${p.uses.length} ${p.uses.length === 1 ? "día" : "días"} en 8 semanas`);

/** The last 14 days as dots, and the button for today. */
function Uses({ p, today }: { p: ProductView; today: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const done = new Set(p.uses);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
      <span className="flex gap-[3px]" aria-label="Últimos 14 días">
        {days.map((d) => (
          <span key={d} className={cn("size-2 rounded-full", done.has(d) ? "bg-gray-900" : "bg-gray-200", d === today && "ring-1 ring-gray-400 ring-offset-1")} />
        ))}
      </span>
      <Button
        type="button"
        size="toolbar"
        variant={done.has(today) ? "default" : "outline"}
        className="ml-auto"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const res = await markUsed(p.id);
            if (!res.success) setError(res.error);
          })
        }
      >
        <Check />
        {done.has(today) ? "Usado hoy" : "Lo he usado hoy"}
      </Button>
      {error ? (
        <p className="flex w-full items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      {children}
    </div>
  );
}

/** The full list folded: it is long and only sometimes wanted. */
function Ingredients({ list }: { list: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-xs font-medium text-gray-500 hover:text-gray-900">
        Ingredientes ({list.length}) {open ? "▴" : "▾"}
      </button>
      {open ? <p className="mt-1 text-xs leading-relaxed text-gray-600">{list.join(", ")}</p> : null}
    </div>
  );
}

/** One line of evidence: what to do, and the why with its study behind the ⓘ. */
function Evidence({ e }: { e: SkinEvidence }) {
  const [why, setWhy] = useState(false);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{e.title}</p>
          <p className="text-xs text-gray-500">{e.line}</p>
        </div>
        <button
          type="button"
          onClick={() => setWhy((w) => !w)}
          aria-label="Por qué"
          aria-expanded={why}
          className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:text-gray-900"
        >
          <Info className="size-4" />
        </button>
      </div>
      {why ? (
        <p className="mt-1 text-xs leading-relaxed text-gray-700">
          {e.why}{" "}
          <a href={e.source.url} target="_blank" rel="noreferrer" className="text-gray-500 underline underline-offset-2">
            {e.source.short}
          </a>
        </p>
      ) : null}
    </li>
  );
}
