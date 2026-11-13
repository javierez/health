import { cn } from "~/lib/utils";
import type { Learned } from "~/server/training/summary";

/**
 * An exercise in its two poses (`~/server/training/learn`: one drawing, the
 * start on the left half and the end on the right), the end fading in and out
 * over the start: it moves. Still on the start when he asks his phone for
 * less motion. Nothing until it is drawn.
 */
export function Move({ move, size, className }: { move: Learned; size: number; className?: string }) {
  if (!move.drawn) return null;
  // Behind the login: a CSS background goes with the cookie, like the drawn icons.
  // The edges trimmed: the drawing sometimes puts a line between the halves.
  const half = (side: "left" | "right") => ({
    backgroundImage: `url(/api/icon/mov-${move.key})`,
    backgroundSize: "200% 100%",
    backgroundPosition: side,
    clipPath: "inset(0 2%)",
  });
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: (size * 3) / 4, height: size }} aria-hidden>
      <span className="absolute inset-0 bg-no-repeat" style={half("left")} />
      <span className="absolute inset-0 animate-rep bg-no-repeat opacity-0 motion-reduce:hidden" style={half("right")} />
    </span>
  );
}

/** A session's or a routine's drawings in a row, the rest as «+2». */
export function Moves({ moves, max = 5 }: { moves: (Learned | null)[]; max?: number }) {
  const drawn = moves.filter((m): m is Learned => m?.drawn === true);
  if (drawn.length === 0) return null;
  return (
    <span className="mt-1 flex items-center gap-0.5">
      {drawn.slice(0, max).map((m, i) => (
        <Move key={`${i}-${m.key}`} move={m} size={28} />
      ))}
      {drawn.length > max ? <span className="ml-1 text-xs text-gray-400">+{drawn.length - max}</span> : null}
    </span>
  );
}
