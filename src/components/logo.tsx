import { cn } from "~/lib/utils";

/**
 * vlog (Javier, 18-oct-2026: «call it vlog… it should be aluminum like the
 * icons»; he chose «Pulso» of six in `docs/vlog/`). The mark is a heartbeat
 * line in brushed aluminium whose beat is the «v», rendered like the app's
 * own drawings, and it goes alone: «como se parece a una V… utilizar ese logo
 * y no poner vlog con letra». `public/icon.png` and `public/apple-icon.png`
 * are the same.
 */
export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 18 KB, never resized: next/image adds nothing
    <img src="/brand/pulso.webp" alt="vlog" className={cn("-my-3 inline-block size-[2em] object-contain", className)} />
  );
}
