"use client";

import { useState, useTransition, type ReactNode } from "react";
import Image from "next/image";

import { toggleTick } from "~/app/actions";
import { iconSrc } from "~/lib/renders";
import { cn } from "~/lib/utils";

/**
 * What «Hoy» and the commitment cards share: the tick, the hint over a mark,
 * the clay render of each thing and the way to the chat for a photo. Nothing
 * here moves or unfolds on hover: the detail opens on a click, in a modal.
 */

/** The tick shows at once; if the server says no, it goes back. */
export function useTick(day: string, key: string, initial: boolean) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  // When the server's word changes, it wins.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setOn(initial);
  }
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await toggleTick({ day, key });
      if (!res.success) setOn(!next);
    });
  };
  return { on, toggle, pending };
}

/** The health chat on the 621. A photo is proven there, not uploaded here. */
export const chatLink = (text: string) => `https://wa.me/34621339327?text=${encodeURIComponent(text)}`;

/** The object: the baked render, or the icon drawn for a kind he invented. Faded once done. */
export function Render({
  area,
  title,
  kind,
  size,
  done = false,
  className,
}: {
  area: string;
  title?: string;
  kind?: string | null;
  size: number;
  done?: boolean;
  className?: string;
}) {
  const src = iconSrc(area, title, kind);
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      // A drawn icon sits behind the login: the browser fetches it with the cookie, not next/image.
      unoptimized={src.startsWith("/api/")}
      draggable={false}
      className={cn(
        "shrink-0 select-none transition-opacity duration-300",
        done && "opacity-40 grayscale",
        className,
      )}
    />
  );
}

/**
 * A routine's products, fanned like cards in the 32 px of one icon, so its
 * title lines up with the rest: one look says what goes in it.
 */
export function Stack({ kinds, done = false }: { kinds: (string | null)[]; done?: boolean }) {
  const shown = kinds.slice(0, 3);
  if (shown.length === 1) return <Render area="habit" kind={shown[0]} size={32} done={done} />;
  return (
    <span className="flex size-8 shrink-0 items-center">
      {shown.map((kind, i) => (
        <Render key={i} area="habit" kind={kind} size={24} done={done} className={i === 0 ? undefined : shown.length === 2 ? "-ml-4" : "-ml-5"} />
      ))}
    </span>
  );
}

/** A small label over the element on hover, fading in place. Short: a date and a number. */
export function Tip({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
