"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";

import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { dayTitle, weekdayLetter } from "~/lib/day";
import { listOf } from "~/lib/today-sections";
import { cn } from "~/lib/utils";
import type { Today, TodoRow } from "~/server/queries/today";
import { Render, Stack, Tip, useTick } from "./tick";

/**
 * What is left to do today, and only that: what cannot wait, then what he
 * ticks or proves with a photo, then what the data marks on its own. A
 * routine is one row and one tap for all its creams (Javier, 19-oct-2026). A row
 * is its title; the why opens on a tap (Javier, 17-oct-2026: too much
 * text). What is done
 * folds into one line; the studied recommendations follow as «Haz» and
 * «Evita», the study behind a tap (Javier, 17-oct-2026: «siempre quiero
 * recomendaciones… las referencias un poco menos visibles»); the medical
 * pending is «Lo urgente», above. The order is the server's, by the hour
 * of his day (`byMoment`), so a tick crosses a row out without making it jump. The last seven days sit in
 * the header, a ring each, closed when all of it got done: a tap opens that
 * day, to see it or tick what he forgot (Javier, 19-oct-2026: «difficult to
 * see if previous day you managed to achieve it all»). Only the five most
 * relevant are in sight, the rest a scroll away (Javier, 22-oct-2026: «los 5
 * elementos más relevantes y podamos hacer scroll… muy clean»).
 */
export function TodayCard({ today, past = [], className, style }: { today: Today; past?: Today[]; className?: string; style?: CSSProperties }) {
  const days = [...past, today];
  const [at, setAt] = useState(days.length - 1);
  const day = days[at] ?? today;
  return (
    <Card className={cn("p-4 animate-rise motion-reduce:animate-none", className)} style={style}>
      {/* Each day starts from what the server says: its ticks are its own. */}
      <Day key={day.day} today={day} days={days} at={at} onPick={setAt} />
    </Card>
  );
}

function Day({ today, days, at, onPick }: { today: Today; days: Today[]; at: number; onPick: (i: number) => void }) {
  const title = dayTitle(today.day, days[days.length - 1]?.day ?? today.day);
  const list = listOf(today.rows);
  const advice = today.rows.filter((r) => r.source);
  const todo = list.filter((r) => !r.done);
  const finished = list.filter((r) => r.done);

  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<TodoRow | null>(null);
  const [panel, setPanel] = useState(false);
  const count = list.filter((r) => ticked[r.key] ?? r.done).length;
  const onChange = (key: string) => (on: boolean) => setTicked((t) => ({ ...t, [key]: on }));

  return (
    <>
      <div className="flex items-center gap-3 px-2">
        <h2 className="shrink-0 text-sm font-medium text-gray-900 first-letter:uppercase">{title}</h2>
        {today.source ? <span className="hidden min-w-0 truncate text-xs text-gray-500 sm:block">{today.source}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <Days days={days} at={at} live={count} onPick={onPick} />
          <span className="text-xs tabular-nums text-gray-500">
            {count}/{list.length}
          </span>
        </div>
      </div>

      <Scroll>
        {todo.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 py-8 text-sm font-medium text-gray-900">
            <Check className="size-4" strokeWidth={3} /> Todo hecho
          </p>
        ) : (
          <ul className="mt-1">
            {todo.map((r, i) => (
              <Row key={r.key} row={r} day={today.day} index={i} onOpen={() => setDetail(r)} onChange={onChange(r.key)} />
            ))}
          </ul>
        )}

        {(["haz", "evita"] as const).map((verb) => {
          const rows = advice.filter((r) => (r.verb ?? "haz") === verb);
          return rows.length === 0 ? null : (
            <div key={verb} className="mt-2">
              <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">{verb === "haz" ? "Haz" : "Evita"}</p>
              <ul>
                {rows.map((r, i) => (
                  <Row key={r.key} row={r} day={today.day} index={todo.length + i} onOpen={() => setDetail(r)} onChange={() => undefined} />
                ))}
              </ul>
            </div>
          );
        })}
      </Scroll>

      {finished.length > 0 ? (
        <div className="mt-2 border-t border-gray-100 px-2 pt-3">
          <button
            type="button"
            onClick={() => setPanel(true)}
            className="flex w-full min-w-0 items-center gap-1.5 text-left text-xs text-gray-500 transition-colors hover:text-gray-900"
          >
            <Check className="size-3.5 shrink-0" strokeWidth={3} />
            <span className="truncate">Hecho: {finished.map((r) => r.title).join(" · ")}</span>
          </button>
        </div>
      ) : null}

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.title}>
        {detail ? <Why row={detail} /> : null}
      </Modal>
      <Modal open={panel} onClose={() => setPanel(false)} title={title === "Hoy" ? "Hecho hoy" : `Hecho ${title.toLowerCase()}`}>
        <ul className="divide-y divide-gray-100">
          {finished.map((r) => (
            <Row key={r.key} row={r} day={today.day} full onChange={onChange(r.key)} />
          ))}
        </ul>
      </Modal>
    </>
  );
}

/** Five rows and a half in sight, the half fading while there is more below. */
function Scroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const check = () => {
    const el = ref.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };
  useEffect(check, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={ref}
      onScroll={check}
      className={cn(
        "max-h-[17.5rem] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        more && "[mask-image:linear-gradient(to_bottom,black_calc(100%-3.5rem),transparent)]",
      )}
    >
      {children}
    </div>
  );
}

/** The last seven days, today last: a ring each, closed with a tick when all of it got done. */
function Days({ days, at, live, onPick }: { days: Today[]; at: number; live: number; onPick: (i: number) => void }) {
  const last = days[days.length - 1]?.day ?? "";
  return (
    <div className="flex items-center">
      {days.map((d, i) => {
        const list = listOf(d.rows);
        // The open day counts its ticks as they happen.
        const done = i === at ? live : list.filter((r) => r.done).length;
        return (
          <button
            key={d.day}
            type="button"
            onClick={() => onPick(i)}
            aria-pressed={i === at}
            aria-label={`${dayTitle(d.day, last)}: ${done} de ${list.length}`}
            className="flex flex-col items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-50"
          >
            <Ring done={done} total={list.length} />
            <span className={cn("text-[10px] leading-none", i === at ? "font-medium text-gray-900" : "text-gray-400")}>{weekdayLetter(d.day)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  if (total > 0 && done >= total) {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-gray-900 text-white">
        <Check className="size-2.5" strokeWidth={4} />
      </span>
    );
  }
  const r = 6;
  const arc = (2 * Math.PI * r * done) / Math.max(total, 1);
  return (
    <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" className="stroke-gray-200" />
      {done > 0 ? (
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${arc} 100`}
          className="stroke-gray-900 transition-[stroke-dasharray] duration-500 ease-out"
        />
      ) : null}
    </svg>
  );
}

const HOW: Record<string, string> = {
  check: "Lo marcas tú al hacerlo, o se lo dices al chat.",
  auto: "Se marca solo con los datos.",
};

/** The whole why of one row: its reason, how it gets done, and the study behind it. */
function Why({ row }: { row: TodoRow }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-gray-700">
      {row.detail ? <p className="first-letter:uppercase">{row.detail}</p> : null}
      {row.verb === "evita" ? null : <p className="text-xs text-gray-500">{HOW[row.tick ?? "auto"]}</p>}
      {row.source ? (
        <a href={row.source.url} target="_blank" rel="noreferrer" className="inline-block text-xs text-gray-500 underline underline-offset-2">
          {row.source.short}
        </a>
      ) : null}
    </div>
  );
}

function Row({
  row,
  day,
  index = 0,
  full = false,
  onOpen,
  onChange,
}: {
  row: TodoRow;
  day: string;
  index?: number;
  full?: boolean;
  onOpen?: () => void;
  onChange: (on: boolean) => void;
}) {
  const { on, toggle } = useTick(day, row.key, row.done);
  // The header counts what is ticked, a tick the server undid included.
  useEffect(() => onChange(on), [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = (
    <>
      <p className={cn("text-sm font-medium", !full && "truncate", on ? "text-gray-400 line-through decoration-gray-300" : "text-gray-900")}>
        {row.title}
      </p>
      {full && row.detail ? <p className="mt-0.5 text-xs leading-relaxed text-gray-500 first-letter:uppercase">{row.detail}</p> : null}
      {full && row.source ? (
        <a href={row.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-gray-400 underline underline-offset-2">
          {row.source.short}
        </a>
      ) : null}
    </>
  );
  return (
    <li
      className={cn("flex items-center gap-3 py-2", !full && "rounded-xl px-2 animate-row-in motion-reduce:animate-none")}
      style={full ? undefined : { animationDelay: `${Math.min(index, 10) * 50}ms` }}
    >
      {row.kinds?.length ? <Stack kinds={row.kinds} done={on} /> : <Render area={row.area} title={row.title} kind={row.kind} size={32} done={on} />}
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          {text}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      <Mark row={row} on={on} onToggle={toggle} />
    </li>
  );
}

/** The circle on the right: tick it, or it ticks itself. */
export function Mark({ row, on, onToggle }: { row: TodoRow; on: boolean; onToggle: () => void }) {
  // Something to leave is done by not doing it: nothing to tick.
  if (row.verb === "evita") return null;
  if (on) {
    const done = (
      <span className="flex size-7 items-center justify-center rounded-full bg-gray-900 text-white animate-pop motion-reduce:animate-none">
        <Check className="size-4" strokeWidth={3} />
      </span>
    );
    return row.tick === "check" ? (
      <button type="button" onClick={onToggle} aria-label="Desmarcar" className="shrink-0">
        {done}
      </button>
    ) : (
      <span className="shrink-0">{done}</span>
    );
  }
  if (row.tick === null) {
    return (
      <Tip text="Se marca solo" className="shrink-0">
        <span className="size-7 rounded-full border-2 border-dashed border-gray-200" />
      </Tip>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Marcar como hecho"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-transparent transition-colors hover:border-gray-900 hover:text-gray-300",
        row.urgent ? "border-amber-400" : "border-gray-300",
      )}
    >
      <Check className="size-4" strokeWidth={3} />
    </button>
  );
}
