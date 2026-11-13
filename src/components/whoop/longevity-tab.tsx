import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { Day } from "~/lib/whoop/days";
import { cardioMinutes, exerciseWeeks, regularity, socialWeeks, STEP_GOAL, stepDays, vo2Months, type Spoken } from "~/lib/whoop/longevity";
import { Empty, hmm, Panel } from "./parts";

/**
 * Longevidad: the five charts with the most evidence for living longer and
 * better, ordered by that evidence (A: meta-analysis or cohorts over 100,000;
 * B: one large cohort, measured objectively). Each says what it is, what to
 * do, and where it comes from; amber only where he is short.
 */
export function LongevityTab({ days, day, maxHr, spoken }: { days: Day[]; day: string; maxHr: number | null; spoken: Spoken[] }) {
  return (
    <div className="space-y-3">
      <Vo2 days={days} maxHr={maxHr} />
      <Exercise days={days} day={day} />
      <Steps days={days} day={day} />
      <Social spoken={spoken} day={day} />
      <Regularity days={days} day={day} />
    </div>
  );
}

function Card({ n, grade, title, todo, note, refs, children }: { n: number; grade: "A" | "B"; title: string; todo: string; note?: string; refs: string[]; children: ReactNode }) {
  return (
    <Panel title={`${n} · ${title}`} right={<span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">Evidencia {grade}</span>}>
      {children}
      <p className="mt-3 text-sm text-gray-800">{todo}</p>
      {note ? <p className="mt-1 text-[11px] text-gray-400">≈ {note}</p> : null}
      <details className="mt-2 text-[11px] text-gray-500">
        <summary className="cursor-pointer select-none font-medium text-gray-600">Evidencia</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {refs.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

function Big({ value, unit, amber, sub }: { value: string; unit: string; amber?: boolean; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <p className={cn("text-3xl font-bold tabular-nums", amber ? "text-amber-600" : "text-gray-900")}>
        {value} <span className="text-sm font-normal text-gray-500">{unit}</span>
      </p>
      {sub ? <p className="text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

const W = 320;
const H = 110;
const fmt = (n: number) => Math.round(n).toLocaleString("es-ES");
const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const noon = (d: string) => new Date(`${d.length === 7 ? `${d}-15` : d}T12:00:00Z`);

/** Bars for any series: `stack` from the bottom, a dashed goal line, labels under the first and last. */
function Bars({ cols, max, goal, labels }: { cols: { key: string; stack: { v: number; tone: string }[] }[]; max: number; goal?: number; labels: [string, string] }) {
  const top = Math.max(max, goal ?? 0) * 1.1 || 1;
  // Few columns (a new source) stay bar-sized, against the right edge where «now» is.
  const bw = W / Math.max(cols.length, 8);
  const x0 = W - cols.length * bw;
  const y = (v: number) => H - (v / top) * H;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {cols.map((c, i) => {
          let base = 0;
          return c.stack.map((s) => {
            const r = <rect key={`${c.key}-${s.tone}`} x={x0 + i * bw + bw * 0.15} width={bw * 0.7} y={y(base + s.v)} height={(s.v / top) * H} rx="1.5" className={s.tone} />;
            base += s.v;
            return r;
          });
        })}
        {goal ? <line x1="0" x2={W} y1={y(goal)} y2={y(goal)} strokeDasharray="3 3" className="stroke-gray-400" /> : null}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  );
}

function Vo2({ days, maxHr }: { days: Day[]; maxHr: number | null }) {
  const ms = vo2Months(days, maxHr);
  const last = ms.at(-1);
  const props = {
    n: 1,
    grade: "A" as const,
    title: "Forma cardiorrespiratoria (VO₂máx)",
    todo: "Mantenerlo con 1 o 2 sesiones de cardio intenso a la semana. El número de verdad sale de una prueba de esfuerzo.",
    note: `Fórmula de Uth (15,3 × pulso máx ÷ pulso en reposo) con el pulso máx de WHOOP${maxHr ? ` (${maxHr})` : ""}. Con 14 en vez de 15,3 sale el borde bajo de la franja.`,
    refs: [
      "Kodama 2009, JAMA. 33 cohortes, 102.980 personas: cada MET más (3,5 ml/kg/min), mortalidad RR 0,87.",
      "Mandsager 2018, JAMA Netw Open. 122.007 pruebas de esfuerzo: élite frente a baja, HR 0,20, sin techo.",
      "Zhang 2016, CMAJ. 46 estudios, 1,2 millones: +10 lpm en reposo, mortalidad RR 1,09.",
    ],
  };
  if (!last) return <Card {...props}><Empty>Falta el pulso máximo de WHOOP.</Empty></Card>;
  const lo = 25;
  const hi = 65;
  const x = (i: number) => (ms.length === 1 ? W / 2 : 4 + (i / (ms.length - 1)) * (W - 8));
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  // Kodama's high-fitness line: 10,9 METs.
  const fit = 38.2;
  return (
    <Card {...props}>
      <Big value={`≈${Math.round(last.high)}`} unit="ml/kg/min" sub={`entre ${Math.round(last.low)} y ${Math.round(last.high)} · forma alta desde ${fit}`} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <polygon points={[...ms.map((m, i) => `${x(i)},${y(m.high)}`), ...ms.map((m, i) => `${x(i)},${y(m.low)}`).reverse()].join(" ")} className="fill-gray-100" />
        <line x1="0" x2={W} y1={y(fit)} y2={y(fit)} strokeDasharray="3 3" className="stroke-gray-300" />
        <polyline points={ms.map((m, i) => `${x(i)},${y(m.high)}`).join(" ")} fill="none" strokeWidth="1.5" className="stroke-gray-800" />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{monthLabel.format(noon(ms[0]!.month))}</span>
        <span>{monthLabel.format(noon(last.month))}</span>
      </div>
    </Card>
  );
}

function Exercise({ days, day }: { days: Day[]; day: string }) {
  const ws = exerciseWeeks(days, day);
  const cardio = ws.reduce((a, w) => a + cardioMinutes(w), 0) / ws.length;
  const strength = ws.reduce((a, w) => a + w.strength, 0) / ws.length;
  return (
    <Card
      n={2}
      grade="A"
      title="Ejercicio a la semana"
      todo="Llegar a 150 min de cardio moderado o 75 de intenso: 3 × 25 min de bici o carrera. La fuerza, entre 30 y 60 min, ya da casi todo su beneficio."
      note="Cuenta solo los entrenos que registró la pulsera. Zonas 1-3 como moderado y 4-5 como intenso (vale doble)."
      refs={[
        "Lee 2022, Circulation. 116.221 adultos, 30 años: 75-149 min/sem intenso, mortalidad HR 0,81; 150-299 moderado, 19-25 % menos.",
        "Momma 2022, Br J Sports Med. 16 cohortes: fuerza, 10-17 % menos mortalidad, máximo a 30-60 min/sem.",
      ]}
    >
      <Big value={fmt(cardio)} unit="min de cardio / semana" amber={cardio < 150} sub={<>de 150 · fuerza <b className="tabular-nums text-gray-800">{fmt(strength)}</b> min / semana (media de 8 semanas)</>} />
      <Bars
        cols={ws.map((w) => ({ key: w.from, stack: [{ v: w.moderate, tone: "fill-gray-400" }, { v: 2 * w.vigorous, tone: "fill-gray-800" }] }))}
        max={Math.max(...ws.map(cardioMinutes))}
        goal={150}
        labels={[dayLabel.format(noon(ws[0]!.from)), `semana del ${dayLabel.format(noon(ws.at(-1)!.from))}`]}
      />
    </Card>
  );
}

function Steps({ days, day }: { days: Day[]; day: string }) {
  const xs = stepDays(days, day);
  const props = {
    n: 3,
    grade: "A" as const,
    title: "Pasos al día",
    todo: "Los días de oficina son el hueco: una vuelta de 30 min al mediodía son unos 3.500 pasos.",
    note: "Últimos 30 días. Fuera los días de menos de 1.000 pasos: la pulsera no estaba puesta.",
    refs: ["Paluch 2022, Lancet Public Health. 15 cohortes, 47.471 adultos: frente a 3.553 pasos, 7.842 → HR 0,55. Meseta entre 8.000 y 10.000 por debajo de los 60."],
  };
  if (xs.length === 0) return <Card {...props}><Empty>Aún no hay pasos.</Empty></Card>;
  const mean = xs.reduce((a, x) => a + x.steps, 0) / xs.length;
  const hit = xs.filter((x) => x.steps >= STEP_GOAL).length;
  return (
    <Card {...props}>
      <Big value={fmt(mean)} unit="pasos de media" amber={mean < STEP_GOAL} sub={`${hit} de ${xs.length} días por encima de ${fmt(STEP_GOAL)}`} />
      <Bars
        cols={xs.map((x) => ({ key: x.day, stack: [{ v: x.steps, tone: x.steps >= STEP_GOAL ? "fill-gray-800" : "fill-gray-300" }] }))}
        max={Math.max(...xs.map((x) => x.steps))}
        goal={STEP_GOAL}
        labels={[dayLabel.format(noon(xs[0]!.day)), dayLabel.format(noon(xs.at(-1)!.day))]}
      />
    </Card>
  );
}

function Social({ spoken, day }: { spoken: Spoken[]; day: string }) {
  const ws = socialWeeks(spoken, day);
  const props = {
    n: 4,
    grade: "A" as const,
    title: "Tiempo con los tuyos",
    todo: "Un plan fijo con amigos cada semana, apuntado como compromiso.",
    note: "Es lo que oyó el Pocket, no todo tu día: sirve para comparar semanas, no como total.",
    refs: ["Holt-Lunstad 2010, PLoS Medicine. 148 estudios, 308.849 personas: relaciones más fuertes, 50 % más probabilidad de sobrevivir (OR 1,50), del orden de fumar."],
  };
  if (ws.length === 0) return <Card {...props}><Empty>El Pocket aún no ha oído conversaciones.</Empty></Card>;
  const personal = ws.reduce((a, w) => a + w.hours.family + w.hours.friend, 0) / ws.length;
  const work = ws.reduce((a, w) => a + w.hours.work, 0) / ws.length;
  return (
    <Card {...props}>
      <Big value={hmm(personal * 60)} unit="h / semana con pareja, familia y amigos" sub={<>trabajo hablado <b className="tabular-nums text-gray-800">{hmm(work * 60)}</b> h / semana</>} />
      <Bars
        cols={ws.map((w) => ({ key: w.from, stack: [{ v: w.hours.family, tone: "fill-gray-800" }, { v: w.hours.friend, tone: "fill-gray-400" }] }))}
        max={Math.max(...ws.map((w) => w.hours.family + w.hours.friend))}
        labels={[dayLabel.format(noon(ws[0]!.from)), `semana del ${dayLabel.format(noon(ws.at(-1)!.from))}`]}
      />
      <p className="mt-1 flex gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-gray-800" />Pareja y familia</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-gray-400" />Amigos</span>
      </p>
    </Card>
  );
}

const clockOf = (m: number) => hmm(((m % 1440) + 1440) % 1440);

function Regularity({ days, day }: { days: Day[]; day: string }) {
  const r = regularity(days, day);
  const props = {
    n: 5,
    grade: "B" as const,
    title: "Regularidad del sueño",
    todo: "Una hora fija de acostarte, también el fin de semana, dentro de ±30 min.",
    note: "El estudio usa el Sleep Regularity Index; aquí, la desviación de tus horas de acostarte y levantarte (9 semanas). Misma idea, no el mismo número.",
    refs: ["Windred 2024, Sleep. UK Biobank, 60.977 personas con acelerómetro: los más regulares, 20-48 % menos mortalidad. Predijo mejor que la duración."],
  };
  if (r.sd === null || r.nights.length === 0) return <Card {...props}><Empty>Faltan noches.</Empty></Card>;
  const beds = r.nights.map((n) => n.bed);
  // 22:00 at the top, 14:00 at the bottom: every night fits.
  const lo = -120;
  const hi = 840;
  const bw = W / r.nights.length;
  const y = (m: number) => ((m - lo) / (hi - lo)) * H;
  return (
    <Card {...props}>
      <Big value={`±${Math.round(r.sd)}`} unit="min de variación" amber={r.sd > 30} sub={`te acuestas entre las ${clockOf(Math.min(...beds))} y las ${clockOf(Math.max(...beds))}`} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 480].map((m) => (
          <line key={m} x1="0" x2={W} y1={y(m)} y2={y(m)} className="stroke-gray-100" />
        ))}
        {r.nights.map((n, i) => (
          <rect key={n.day} x={i * bw + bw * 0.2} width={bw * 0.6} y={y(n.bed)} height={Math.max(1, y(n.wake) - y(n.bed))} rx="1" className="fill-gray-700" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{dayLabel.format(noon(r.nights[0]!.day))}</span>
        <span>barras: de acostarte a levantarte · líneas 00:00 y 08:00</span>
        <span>{dayLabel.format(noon(r.nights.at(-1)!.day))}</span>
      </div>
    </Card>
  );
}
