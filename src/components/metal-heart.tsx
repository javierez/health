import Image from "next/image";

import { cn } from "~/lib/utils";

/**
 * The pulse's heart: brushed aluminium like the other renders, never the emoji
 * (Javier, 15-nov-2026). `beat`: it beats, lub-dub, at that many per minute.
 */
export function MetalHeart({ beat, className }: { beat?: number; className?: string }) {
  return (
    <Image
      src="/renders/heart.webp"
      alt=""
      width={96}
      height={96}
      className={cn("size-4 shrink-0 select-none", beat && "motion-safe:animate-beat", className)}
      style={beat ? { animationDuration: `${(60 / beat).toFixed(2)}s` } : undefined}
      draggable={false}
    />
  );
}
