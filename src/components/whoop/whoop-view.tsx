"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import { addDays, dayTitle } from "~/lib/day";
import type { MetricKey } from "~/lib/whoop/stats";
import type { WhoopData } from "~/server/queries/whoop";
import { HabitsTab } from "./habits-tab";
import { HealthTab } from "./health-tab";
import { HealthspanTab } from "./healthspan-tab";
import { HomeTab } from "./home-tab";
import { LongevityTab } from "./longevity-tab";
import { ReadingTab } from "./reading-tab";
import { RecoveryTab, StrainTab } from "./rings-tabs";
import { SleepTab } from "./sleep-tab";
import { dayStress, StressTab } from "./stress-tab";
import { TrendTab } from "./trend-tab";

/**
 * Every WHOOP screen, in health's colours and off the main path (Datos →
 * WHOOP): the numbers are there when he wants them, never in front.
 */
const TABS = [
  { key: "reading", label: "Conclusiones" },
  { key: "home", label: "Hoy" },
  { key: "recovery", label: "Recuperación" },
  { key: "sleep", label: "Sueño" },
  { key: "strain", label: "Esfuerzo" },
  { key: "stress", label: "Estrés" },
  { key: "health", label: "Salud" },
  { key: "healthspan", label: "Healthspan" },
  { key: "longevity", label: "Longevidad" },
  { key: "trends", label: "Tendencias" },
  { key: "habits", label: "Hábitos" },
] as const;
export type Tab = (typeof TABS)[number]["key"];

export function WhoopView({ data }: { data: WhoopData }) {
  const { days, today, intraday } = data;
  const [tab, setTab] = useState<Tab>("reading");
  const [day, setDay] = useState(today);
  const [metric, setMetric] = useState<MetricKey>("recovery");
  const first = days[0]?.day ?? today;
  const trendOf = (k: MetricKey) => {
    setMetric(k);
    setTab("trends");
  };
  const stressNow = dayStress(days, day, intraday.hr, data.maxHr).at(-1)?.value ?? days.find((d) => d.day === day)?.stress ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <header className="flex items-center gap-3 animate-rise motion-reduce:animate-none">
        <h1 className="mr-auto text-2xl font-bold tracking-tight sm:text-3xl">WHOOP</h1>
        <Button asChild size="pill" variant="outline">
          <Link href="/?ver=panel">
            <ArrowLeft />
            Panel
          </Link>
        </Button>
      </header>

      <div className="flex items-center justify-center gap-2">
        <Button type="button" size="toolbarIcon" variant="outline" disabled={day <= first} onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">
          <ChevronLeft />
        </Button>
        <span className="min-w-28 text-center text-sm font-semibold first-letter:uppercase">{dayTitle(day, today)}</span>
        <Button type="button" size="toolbarIcon" variant="outline" disabled={day >= today} onClick={() => setDay(addDays(day, 1))} aria-label="Día siguiente">
          <ChevronRight />
        </Button>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Button key={t.key} type="button" size="toolbar" variant={tab === t.key ? "default" : "outline"} aria-pressed={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0">
            {t.label}
          </Button>
        ))}
      </div>

      <div key={tab}>
        {tab === "reading" ? <ReadingTab reading={data.reading} today={today} /> : null}
        {tab === "home" ? <HomeTab days={days} day={day} stress={stressNow} onTab={setTab} onTrend={trendOf} /> : null}
        {tab === "recovery" ? <RecoveryTab days={days} day={day} onTrend={trendOf} /> : null}
        {tab === "sleep" ? <SleepTab days={days} day={day} hr={intraday.hr} hypnogram={intraday.hypnogram} onTrend={trendOf} /> : null}
        {tab === "strain" ? <StrainTab days={days} day={day} hr={intraday.hr} onTrend={trendOf} /> : null}
        {tab === "stress" ? <StressTab days={days} day={day} hr={intraday.hr} maxHr={data.maxHr} /> : null}
        {tab === "health" ? <HealthTab days={days} day={day} onTrend={trendOf} /> : null}
        {tab === "healthspan" ? <HealthspanTab days={days} day={day} age={data.age} maxHr={data.maxHr} /> : null}
        {tab === "longevity" ? <LongevityTab days={days} day={day} maxHr={data.maxHr} spoken={data.spoken} /> : null}
        {tab === "trends" ? <TrendTab days={days} day={day} metric={metric} onMetric={setMetric} /> : null}
        {tab === "habits" ? <HabitsTab good={data.habits.good} bad={data.habits.bad} /> : null}
      </div>
    </div>
  );
}
