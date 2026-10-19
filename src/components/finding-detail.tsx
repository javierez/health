"use client";

import { useState, useTransition } from "react";
import { AlertCircle, FlaskConical } from "lucide-react";

import { tryFinding } from "~/app/actions";
import { Button } from "~/components/ui/button";
import { ink } from "~/lib/scale";
import { cn } from "~/lib/utils";
import type { Finding, Group } from "~/server/insights/findings";
import { OUTCOMES, points, type OutcomeKey } from "~/server/insights/outcomes";

/** «Seguro», «Probable», «Por aclarar»: how much to trust it, in one word. */
export function trust(f: Finding) {
  return f.tier === "unclear" ? "Por aclarar" : f.tier === "none" ? null : f.sure ? "Seguro" : "Probable";
}

/**
 * What to do, every night of both sides drawn, the numbers, and the study.
 * When it can be chosen day by day, «Probarlo dos semanas» starts an
 * experiment that settles it.
 */
export function FindingDetail({ finding: f }: { finding: Finding }) {
  const [pending, start] = useTransition();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const word = trust(f);
  return (
    <div className="space-y-4">
      {f.todo ? (
        <p className="text-sm text-gray-900">
          <b className="font-semibold">{f.todo.verb === "haz" ? "Haz" : "Evita"}:</b> {f.todo.action}.{" "}
          <span className="text-gray-500">
            <b className={cn("font-semibold tabular-nums", ink(f.outcome, f.points))}>{points(f.outcome, f.points)}</b>{" "}
            {f.outcome === "recovery"
              ? "puntos de recuperación"
              : f.outcome === "symptoms"
                ? "de días con síntomas"
                : `de ${f.outcome === "hrv" ? "VFC" : OUTCOMES[f.outcome].label.toLowerCase()}`}
            .
          </span>
        </p>
      ) : null}
      <Strip groups={f.groups} outcome={f.outcome} tone={f.tier === "none" ? "gray" : f.good ? "dark" : "amber"} />
      <p className="text-xs leading-relaxed text-gray-500">
        {f.detail} {word ? `${word}: ` : ""}
        {f.tier === "unclear"
          ? "la diferencia es grande, pero tus noches varían tanto que aún podría ser casualidad."
          : !f.controllable
            ? "pasa esos días, pero no es algo que hagas: va junto, no tiene por qué ser la causa."
            : "una diferencia en tus datos, no la prueba de la causa."}
      </p>
      {f.why ? <p className="text-xs leading-relaxed text-gray-500">Idea de la IA: {f.why}</p> : null}
      <div className="flex items-center gap-3">
        {f.source ? (
          <a href={f.source.url} target="_blank" rel="noreferrer" className="mr-auto text-xs text-gray-400 underline underline-offset-2">
            {f.source.short}
          </a>
        ) : (
          <span className="mr-auto" />
        )}
        {f.controllable && f.todo ? (
          <Button
            type="button"
            size="toolbar"
            variant="outline"
            disabled={pending || started}
            onClick={() =>
              start(async () => {
                setError("");
                const res = await tryFinding({ key: f.key, outcome: f.outcome });
                if (res.success) setStarted(true);
                else setError(res.error);
              })
            }
          >
            <FlaskConical />
            {started ? "En marcha" : "Probarlo dos semanas"}
          </Button>
        ) : null}
      </div>
      {started ? <p className="text-xs text-gray-500">Empieza hoy: un día sí y otro no, dos semanas. Lo verás en «Hoy».</p> : null}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Every night of both sides as a dot, with its mean: the gap, seen. */
export function Strip({ groups, outcome, tone }: { groups: [Group, Group]; outcome: OutcomeKey; tone: "dark" | "amber" | "gray" }) {
  const meta = OUTCOMES[outcome];
  const all = groups.flatMap((g) => g.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const at = (v: number) => `${hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100}%`;
  const dot = (i: number) => (i > 0 || tone === "gray" ? "bg-gray-400" : tone === "dark" ? "bg-gray-900" : "bg-amber-500");
  const bar = (i: number) => (i > 0 || tone === "gray" ? "bg-gray-500" : tone === "dark" ? "bg-gray-900" : "bg-amber-600");
  return (
    <div className="space-y-4 rounded-xl bg-gray-50 p-4">
      {groups.map((g, i) => (
        <div key={g.label}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-gray-900">{g.label}</span>
            <span className="tabular-nums text-gray-500">
              {g.values.length > 0 ? `${meta.fmt(g.mean)} · ` : ""}
              {g.values.length} {g.values.length === 1 ? "día" : "días"}
            </span>
          </div>
          <div className="relative mt-2 h-6">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gray-200" />
            {g.values.map((v, j) => (
              <span
                key={j}
                className={cn(
                  "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 animate-fade-in motion-reduce:animate-none",
                  dot(i),
                )}
                style={{ left: at(v), animationDelay: `${Math.min(j, 40) * 12}ms` }}
              />
            ))}
            {g.values.length > 0 ? (
              <span className={cn("absolute top-0 h-6 w-0.5 -translate-x-1/2 rounded-full", bar(i))} style={{ left: at(g.mean) }} />
            ) : null}
          </div>
        </div>
      ))}
      {all.length > 0 ? (
        <div className="flex justify-between text-[10px] tabular-nums text-gray-400">
          <span>{meta.fmt(lo)}</span>
          <span>{meta.axis}</span>
          <span>{meta.fmt(hi)}</span>
        </div>
      ) : null}
    </div>
  );
}
