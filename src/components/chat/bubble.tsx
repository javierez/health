import { Check, Volume2 } from "lucide-react";

import { cn } from "~/lib/utils";
import type { ChatLine } from "~/server/queries/chat";

/**
 * One message. Consecutive ones from the same side sit together, like on
 * WhatsApp: tight gap, the inner corners squared, the time once at the end.
 * What the agent did goes above its reply as chips, so the facts read before
 * the chat.
 */
export function Bubble({
  line,
  prev,
  next,
  fresh,
  voice,
  onPlay,
}: {
  line: ChatLine;
  prev: Pick<ChatLine, "mine" | "day"> | undefined;
  next: Pick<ChatLine, "mine" | "day"> | undefined;
  fresh: boolean;
  voice: string | undefined;
  onPlay: (src: string) => void;
}) {
  const showDay = line.day !== prev?.day;
  const joinsPrev = !showDay && prev?.mine === line.mine;
  const joinsNext = next?.mine === line.mine && next.day === line.day;
  return (
    <>
      {showDay ? <p className="my-4 text-center text-xs text-gray-400">{line.day}</p> : null}
      <div
        className={cn(
          "flex flex-col",
          line.mine ? "items-end" : "items-start",
          joinsNext ? "mb-1" : "mb-4",
          fresh && "animate-row-in motion-reduce:animate-none",
        )}
      >
        {line.actions.length > 0 ? (
          <div className="mb-1.5 flex max-w-[85%] flex-wrap gap-1.5">
            {line.actions.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600"
              >
                <Check className="h-3 w-3 shrink-0 text-amber-600" />
                {a}
              </span>
            ))}
          </div>
        ) : null}
        {line.photos.length > 0 ? (
          <div className={cn("mb-1 flex max-w-[80%] flex-wrap gap-1", line.mine ? "justify-end" : "justify-start")}>
            {line.photos.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- his own photo, already 640 px */}
                <img
                  src={src}
                  alt="Foto"
                  className={cn("rounded-2xl object-cover", line.photos.length === 1 ? "max-h-64 w-56" : "h-28 w-28")}
                />
              </a>
            ))}
          </div>
        ) : null}
        {line.body || line.attachment || (line.mine && fresh && line.photos.length === 0) ? (
        <div
          className={cn(
            "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:text-sm",
            line.mine ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900",
            line.mine && joinsPrev && "rounded-tr-md",
            line.mine && joinsNext && "rounded-br-md",
            !line.mine && joinsPrev && "rounded-tl-md",
            !line.mine && joinsNext && "rounded-bl-md",
            line.failed && "opacity-60",
          )}
        >
          {line.attachment ? (
            <span className={cn("mr-1.5", line.mine ? "text-gray-400" : "text-gray-500")}>{line.attachment}</span>
          ) : null}
          {line.body ?? (line.mine && fresh ? "…" : null)}
        </div>
        ) : null}
        {!joinsNext && (line.clock || voice) ? (
          <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-gray-400">
            {voice ? (
              <button
                type="button"
                onClick={() => onPlay(voice)}
                className="flex items-center gap-1 transition-colors hover:text-gray-900"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Escuchar
              </button>
            ) : null}
            {line.clock ? <span className="tabular-nums">{line.clock}</span> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** "Escribiendo…": three dots in a bubble, where the next message will be. */
export function Typing() {
  return (
    <div className="mb-4 flex animate-row-in motion-reduce:animate-none" role="status" aria-label="Escribiendo">
      <span className="flex items-center gap-1 rounded-2xl bg-gray-100 px-3.5 py-3">
        {[0, 0.15, 0.3].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: `${d}s` }} />
        ))}
      </span>
    </div>
  );
}
