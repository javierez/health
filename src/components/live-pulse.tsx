"use client";

import { useEffect, useState } from "react";

import { MetalHeart } from "~/components/metal-heart";

/**
 * The band's pulse, live. Only the Pulso app on his iPhone sends it (a
 * `pulso-hr` event about once a second, from the band over Bluetooth), so in
 * Safari or on the laptop this draws nothing. `null` means the band went quiet.
 */
export function LivePulse() {
  const [hr, setHr] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const v = (e as CustomEvent<unknown>).detail;
      setHr(typeof v === "number" && v > 0 ? Math.round(v) : null);
    };
    window.addEventListener("pulso-hr", on);
    return () => window.removeEventListener("pulso-hr", on);
  }, []);
  if (hr == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-gray-600" aria-label={`Pulso ${hr}`}>
      <MetalHeart beat={hr} className="size-5" />
      {hr}
    </span>
  );
}
