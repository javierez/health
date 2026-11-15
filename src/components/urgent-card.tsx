"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { ChevronRight, Phone } from "lucide-react";

import { MedicalTab } from "~/components/medical-tab";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import type { Labs } from "~/lib/labs";
import { phoneIn } from "~/lib/today-sections";
import { cn } from "~/lib/utils";
import type { DayRows, MedicalRow } from "~/server/queries/salud";
import type { PendingItem, Today } from "~/server/queries/today";
import { Mark } from "./today-card";
import { useTick } from "./tick";

const phoneLabel = (p: string) => p.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
/** Ticked today, by the server's word: it goes below, so a tick does not make it jump. */
const isDone = (today: Today, p: PendingItem) => today.rows.some((r) => r.key === `medical-${p.id}` && r.done);

/**
 * What the medical history says he still has to ask for, above everything and
 * in amber: the one thing on the screen that cannot wait. Always there, never
 * a popup. A tap opens the whole note and the phone; the history opens beside.
 * Ticked today, it stays crossed out until the history says it is done.
 */
export function UrgentCard({
  today,
  medical,
  labs,
  heard,
  style,
}: {
  today: Today;
  medical: MedicalRow[];
  labs: Labs;
  heard: DayRows[];
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const shown = today.pending.find((p) => p.id === open);
  if (today.pending.length === 0) return null;

  const phone = phoneIn(shown?.details ?? null);
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 animate-rise motion-reduce:animate-none" style={style}>
      <div className="flex items-center gap-3 px-2">
        <Image src="/renders/warning.webp" alt="" width={32} height={32} className="-my-1 shrink-0 select-none" draggable={false} />
        <h2 className="text-sm font-medium text-gray-900">Lo urgente</h2>
        <Button size="toolbar" variant="ghost" className="ml-auto hover:bg-amber-100" onClick={() => setHistory(true)}>
          Historial médico
        </Button>
      </div>
      <ul className="mt-1 divide-y divide-amber-200/70">
        {[...today.pending].sort((a, b) => Number(isDone(today, a)) - Number(isDone(today, b))).map((p) => (
          <Item key={p.id} p={p} today={today} onOpen={() => setOpen(p.id)} />
        ))}
      </ul>

      <Modal open={shown !== undefined} onClose={() => setOpen(null)} title={shown?.title}>
        {shown ? (
          <div className="space-y-3">
            {shown.topic ? <p className="text-xs font-medium text-gray-500">{shown.topic}</p> : null}
            {shown.details ? <p className="text-sm leading-relaxed text-gray-700">{shown.details}</p> : null}
            {phone ? (
              <Button asChild size="pill" className="w-full">
                <a href={`tel:+34${phone}`}>
                  <Phone />
                  Llamar al {phoneLabel(phone)}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>
      <Modal open={history} onClose={() => setHistory(false)} title="Historial médico" className="w-[min(92vw,44rem)]">
        <MedicalTab entries={medical} labs={labs} heard={heard} />
      </Modal>
    </section>
  );
}

function Item({ p, today, onOpen }: { p: PendingItem; today: Today; onOpen: () => void }) {
  const row = today.rows.find((r) => r.key === `medical-${p.id}`);
  const { on, toggle } = useTick(today.day, row?.key ?? `medical-${p.id}`, row?.done ?? false);
  const phone = phoneIn(p.details);
  return (
    <li className="flex items-center gap-3 px-2 py-2">
      <button type="button" onClick={onOpen} className="group flex min-w-0 flex-1 items-center gap-1 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[15px] font-medium", on ? "text-gray-400 line-through decoration-gray-300" : "text-gray-900")}>
            {p.title}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-amber-300 transition-colors group-hover:text-amber-600" />
      </button>
      {phone && !on ? (
        <Button asChild size="toolbar" variant="outline" className="shrink-0 bg-white">
          <a href={`tel:+34${phone}`}>
            <Phone />
            <span className="hidden sm:inline">Llamar</span>
          </a>
        </Button>
      ) : null}
      {row ? <Mark row={row} on={on} onToggle={toggle} /> : null}
    </li>
  );
}
