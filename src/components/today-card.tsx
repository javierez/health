"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Camera, Check, ChevronRight } from "lucide-react";

import { Card } from "~/components/ui/card";
import { Modal } from "~/components/ui/modal";
import { cn } from "~/lib/utils";
import type { Today, TodoRow } from "~/server/queries/today";
import { chatLink, Render, Stack, Tip, useTick } from "./tick";

/**
 * What is left to do today, and only that: what cannot wait, then what he
 * ticks or proves with a photo, then what the data marks on its own. A
 * routine is one row and one tap for all its creams (Javier, 19-oct-2026). A row
 * is its title; the why opens on a tap (Javier, 17-oct-2026: too much
 * text). What is done
 * folds into one line; the studied recommendations follow as «Haz» and
 * «Evita», the study behind a tap (Javier, 17-oct-2026: «siempre quiero
 * recomendaciones… las referencias un poco menos visibles»); the medical
 * pending is «Lo urgente», above. The order is the server's, so a
 * tick crosses a row out without making it jump.
 */
const rank = (r: TodoRow) => (r.urgent ? 0 : r.tick === null ? 2 : 1);

export function TodayCard({ today, className, style }: { today: Today; className?: string; style?: CSSProperties }) {
  const own = today.rows.filter((r) => !r.key.startsWith("medical-"));
  const list = own.filter((r) => !r.source);
  const advice = own.filter((r) => r.source);
  const todo = list.filter((r) => !r.done).sort((a, b) => rank(a) - rank(b));
  const finished = list.filter((r) => r.done);

  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<TodoRow | null>(null);
  const [panel, setPanel] = useState(false);
  const count = list.filter((r) => ticked[r.key] ?? r.done).length;
  const onChange = (key: string) => (on: boolean) => setTicked((t) => ({ ...t, [key]: on }));

  return (
    <Card className={cn("p-4 animate-rise motion-reduce:animate-none", className)} style={style}>
      <div className="flex items-center gap-3 px-2">
        <h2 className="text-sm font-medium text-gray-900">Hoy</h2>
        {today.source ? <span className="text-xs text-gray-500">{today.source}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-900 transition-[width] duration-500 ease-out"
              style={{ width: `${list.length > 0 ? (count / list.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-gray-500">
            {count}/{list.length}
          </span>
        </div>
      </div>

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
      <Modal open={panel} onClose={() => setPanel(false)} title="Hecho hoy">
        <ul className="divide-y divide-gray-100">
          {finished.map((r) => (
            <Row key={r.key} row={r} day={today.day} full onChange={onChange(r.key)} />
          ))}
        </ul>
      </Modal>
    </Card>
  );
}

const HOW: Record<string, string> = {
  check: "Lo marcas tú al hacerlo.",
  photo: "Se marca con una foto o un vídeo al chat.",
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
        <button type="button" onClick={onOpen} className="group flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="min-w-0 flex-1">{text}</span>
          <ChevronRight className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      <Mark row={row} on={on} onToggle={toggle} />
    </li>
  );
}

/** The circle on the right: tick it, or take the photo to the chat. */
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
  if (row.tick === "photo") {
    return (
      <Tip text="Mándame una foto o un vídeo" className="shrink-0">
        <a
          href={chatLink(`Foto: ${row.title}`)}
          target="_blank"
          rel="noreferrer"
          aria-label="Mandar una foto o un vídeo por WhatsApp"
          className={cn(
            "flex size-7 items-center justify-center rounded-full border-2 transition-colors hover:bg-gray-900 hover:text-white",
            row.urgent ? "border-amber-400 text-amber-600" : "border-gray-300 text-gray-500",
          )}
        >
          <Camera className="size-3.5" />
        </a>
      </Tip>
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
