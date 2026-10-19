"use client";

import { useState } from "react";

import { DayCards } from "~/components/day-cards";
import { MedicalTab } from "~/components/medical-tab";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { NoResults } from "~/components/ui/no-results";
import { WaPatternCard } from "~/components/wa-pattern-card";
import { GROUPS, type GroupKey } from "~/lib/day-groups";
import type { SaludData } from "~/server/queries/salud";

/**
 * Day by day, inside «Datos»: a card a day, grouped, and chips to see only
 * one thing across days. Nothing to fill in except the medical
 * file: the rest is heard by the Pocket, measured by WHOOP, read from his
 * WhatsApp or sent to the chat.
 */
type Filter = "all" | GroupKey;
const FILTERS: { key: Filter; label: string }[] = [{ key: "all", label: "Todo" }, ...GROUPS];

const EMPTY: Record<Exclude<Filter, "medical">, string> = {
  all: "Aún no hay nada.",
  sleep: "Ninguna noche de WHOOP.",
  training: "Ningún entreno, ni en WHOOP ni en el chat.",
  meals: "Ninguna comida. Mándale una foto al chat o dilo cerca del Pocket.",
  work: "Nada de trabajo oído por el Pocket ni commits.",
  life: "Nada oído por el Pocket fuera del trabajo.",
  whatsapp: "Tu WhatsApp se lee una vez al día, de madrugada. Aún no ha llegado nada.",
};

/** "Todo" is the last two weeks; one group alone goes back a month. */
const ALL_DAYS = 14;

export function DayBrowser({ data }: { data: SaludData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const days =
    filter === "all" ? data.days.slice(0, ALL_DAYS) : data.days.filter((d) => d.groups.some((g) => g.key === filter));

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="toolbar"
            variant={filter === f.key ? "default" : "outline"}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="shrink-0"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {filter === "medical" ? (
        <Card className="p-4 animate-fade-in motion-reduce:animate-none">
          <MedicalTab entries={data.medical} heard={data.heard} />
        </Card>
      ) : (
        <>
          {filter === "whatsapp" ? <WaPatternCard pattern={data.pattern} link /> : null}
          {days.length === 0 ? (
            <Card className="p-4">
              <NoResults title="Nada todavía" message={EMPTY[filter]} />
            </Card>
          ) : (
            <DayCards key={filter} days={days} only={filter === "all" ? null : filter} />
          )}
        </>
      )}
    </div>
  );
}
