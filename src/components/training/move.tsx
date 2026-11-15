import { cn } from "~/lib/utils";
import type { Learned } from "~/server/training/summary";

/**
 * An exercise in its two poses (`~/server/training/learn`: one drawing, the
 * start on the left half and the end on the right), each held on its own and
 * swapped in a quarter-second blurred crossfade, and back: never both still.
 * Still on the start when he asks his phone for less motion. Nothing until
 * it is drawn.
 *
 * `still`: the small ones stand on the start pose and move only while the row
 * they are in (`group`) is hovered (Javier, 15-nov-2026: «the miniatures
 * don't need to move… just the selected or on hover»).
 */
export function Move({ move, size, still, className }: { move: Learned; size: number; still?: boolean; className?: string }) {
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
      <span className={cn("absolute inset-0 bg-no-repeat", still ? "motion-safe:group-hover:animate-rep-start" : "motion-safe:animate-rep-start")} style={half("left")} />
      <span className={cn("absolute inset-0 bg-no-repeat opacity-0 motion-reduce:hidden", still ? "group-hover:animate-rep" : "animate-rep")} style={half("right")} />
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
        <Move key={`${i}-${m.key}`} move={m} size={28} still />
      ))}
      {drawn.length > max ? <span className="ml-1 text-xs text-gray-400">+{drawn.length - max}</span> : null}
    </span>
  );
}
