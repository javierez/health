"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { BalanceCard } from "~/components/balance-card";
import { ExperimentDetail, ExperimentRow } from "~/components/experiment";
import { FindingDetail, trust } from "~/components/finding-detail";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { fill, ink } from "~/lib/scale";
import { cn } from "~/lib/utils";
import type { Finding, Findings } from "~/server/insights/findings";
import { tiers } from "~/server/insights/tiers";
import { OUTCOME_KEYS, OUTCOMES, points, type OutcomeKey } from "~/server/insights/outcomes";
import type { ExperimentView } from "~/server/queries/experiments";

/**
 * How each thing affects him, as a ranking per outcome: recovery first,
 * then his mood, sleep, HRV, pulse, symptoms and his code (Javier, 18-oct-2026: «un ranking, un
 * tier… que no salga todo de primeras» and «qué nos ayuda más a la
 * recuperación, al sueño, a X»). One row each with a bar for how much; the
 * chart waits behind a tap. What makes no difference folds into one row.
 */
export function Effects({ findings, experiments }: { findings: Findings; experiments: ExperimentView[] }) {
  const [outcome, setOutcome] = useState<OutcomeKey>("recovery");
  const [open, setOpen] = useState<Finding | null>(null);
  const [trying, setTrying] = useState<ExperimentView | null>(null);
  const [folded, setFolded] = useState(true);
  // What he does only: what merely goes with his nights (a Sunday, a topic) is not «cómo te afecta».
  const all = findings.by[outcome];
  const r = {
    good: all.good.filter((f) => f.controllable),
    bad: all.bad.filter((f) => f.controllable),
    unclear: all.unclear.filter((f) => f.controllable),
    neutral: all.neutral.filter((f) => f.controllable),
  };
  const max = Math.max(1, ...Object.values(r).flat().map((f) => Math.abs(f.weight)));
  // The color scale runs against the biggest that counts, not the noise.
  const top = Math.max(1, ...[...r.good, ...r.bad].map((f) => Math.abs(f.points)));
  const groups = tiers([...r.good, ...r.bad, ...r.unclear]);
  const nothing = groups.every((t) => t.list.length === 0);
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 animate-rise motion-reduce:animate-none">
        <div className="mr-auto flex min-w-0 items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cómo te afecta</h1>
          <span className="truncate text-sm text-gray-500">{findings.nights} noches</span>
        </div>
        <Button asChild size="pill" variant="outline">
          <Link href="/?ver=panel">
            <ArrowLeft />
            Panel
          </Link>
        </Button>
      </header>

      {experiments.length > 0 ? (
        <Card className="p-4 animate-rise motion-reduce:animate-none" style={{ animationDelay: "0.08s" }}>
          <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">Probando</p>
          <ul>
            {experiments.map((e) => (
              <li key={e.id}>
                <ExperimentRow experiment={e} onOpen={() => setTrying(e)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1.5 animate-rise motion-reduce:animate-none" style={{ animationDelay: "0.12s" }}>
        {OUTCOME_KEYS.map((o) => (
          <Button
            key={o}
            type="button"
            size="toolbar"
            variant={outcome === o ? "default" : "outline"}
            aria-pressed={outcome === o}
            onClick={() => {
              setOutcome(o);
              setFolded(true);
            }}
          >
            {OUTCOMES[o].label}
          </Button>
        ))}
      </div>

      <BalanceCard key={`b-${outcome}`} balance={findings.balance[outcome]} outcome={outcome} style={{ animationDelay: "0.16s" }} />

      <Card key={outcome} className="space-y-3 p-4 animate-rise motion-reduce:animate-none" style={{ animationDelay: "0.24s" }}>
        {nothing ? (
          <p className="px-2 py-6 text-center text-sm text-gray-500">
            {r.neutral.length === 0 && (outcome === "mood" || outcome === "symptoms")
              ? "Sale cuando lleves unas semanas contestando la pregunta de la noche: «un 7, nada»."
              : "Aún no hay nada claro sobre esto."}
          </p>
        ) : null}
        {groups.map((t) =>
          t.list.length === 0 ? null : (
            <div key={t.label}>
              <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">{t.label}</p>
              <ul>
                {t.list.map((f) => (
                  <li key={f.key}>
                    <Row finding={f} max={max} top={top} onOpen={() => setOpen(f)} />
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
        {r.neutral.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setFolded(!folded)}
              aria-expanded={!folded}
              className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
            >
              <span className="min-w-0 flex-1 text-sm text-gray-500">No te afecta ({r.neutral.length})</span>
              <ChevronRight
                className={cn("size-4 shrink-0 text-gray-300 transition-transform group-hover:text-gray-500", !folded && "rotate-90")}
              />
            </button>
            {folded ? null : (
              <ul>
                {r.neutral.map((f) => (
                  <li key={f.key}>
                    <Row finding={f} max={max} top={top} onOpen={() => setOpen(f)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Card>


      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.title} className="w-[min(92vw,36rem)]">
        {open ? <FindingDetail finding={open} /> : null}
      </Modal>
      <Modal open={trying !== null} onClose={() => setTrying(null)} title={trying?.title} className="w-[min(92vw,36rem)]">
        {trying ? <ExperimentDetail experiment={trying} onStopped={() => setTrying(null)} /> : null}
      </Modal>
    </div>
  );
}

function Row({ finding: f, max, top, onOpen }: { finding: Finding; max: number; top: number; onOpen: () => void }) {
  const word = trust(f);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
    >
      <span className="min-w-0 flex-1 text-sm text-gray-900">
        {f.title}
        {word && f.tier !== "unclear" && !f.sure ? <span className="ml-2 text-xs text-gray-400">{word.toLowerCase()}</span> : null}
      </span>
      <span className={cn("w-20 shrink-0 text-right text-sm font-medium tabular-nums", counts(f) ? ink(f.outcome, f.points, top) : "text-gray-400")}>
        {points(f.outcome, f.points)}
      </span>
      <Bar finding={f} max={max} top={top} />
      <ChevronRight className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
    </button>
  );
}

const counts = (f: Finding) => f.tier === "good" || f.tier === "bad";

/** From the middle: right for good, left for bad, in the scale's color; gray when it is noise or nothing. */
function Bar({ finding: f, max, top }: { finding: Finding; max: number; top: number }) {
  return (
    <span className="relative hidden h-2 w-32 shrink-0 sm:block">
      <span className="absolute inset-y-0 left-1/2 w-px bg-gray-200" />
      <span
        className={cn(
          "absolute inset-y-0 rounded-full",
          counts(f) ? fill(f.outcome, f.points, top, 2) : "bg-gray-300",
          f.weight >= 0 ? "left-1/2" : "right-1/2",
        )}
        style={{ width: `${(Math.abs(f.weight) / max) * 50}%` }}
      />
    </span>
  );
}
