"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Runs one generated scene.
 *
 * 🚨 This evaluates JavaScript written by a model. It is safe HERE and only
 * here: single user, own machine, own API key, and the only thing reaching the
 * prompt is a slug from a closed taxonomy. The code is called with exactly two
 * arguments — the THREE namespace and a canvas — so it has no page, no cookies
 * and no network by construction. Do not lift this component into anything
 * multi-tenant without putting the execution in a worker or an iframe first.
 *
 * The host owns the frame loop and the resize observer. A generated scene that
 * started its own `requestAnimationFrame` would keep running after unmount, and
 * ten of those on the weeks tab is a dead tab.
 */
interface SceneApi {
  update: (elapsed: number, width: number, height: number) => void;
  dispose: () => void;
}

export function SceneStage({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let api: SceneApi | null = null;
    let observer: ResizeObserver | null = null;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const [res, THREE] = await Promise.all([
          fetch(`/api/scenes?slug=${encodeURIComponent(slug)}`),
          import("three"),
        ]);
        const body = (await res.json()) as
          | { ok: true; code: string; caption: string | null }
          | { ok: false; detail: string };
        if (cancelled) return;
        if (!body.ok) {
          setError(body.detail);
          setLoading(false);
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Size before the scene is built: a generated scene reads the canvas
        // dimensions once, in its constructor, and a 0x0 canvas renders black.
        const fit = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio, 2);
          canvas.width = Math.max(1, Math.floor(rect.width * dpr));
          canvas.height = Math.max(1, Math.floor(rect.height * dpr));
          return rect;
        };
        const rect = fit();

        const factory = new Function("THREE", "canvas", body.code) as (
          three: typeof THREE,
          canvas: HTMLCanvasElement,
        ) => SceneApi;
        api = factory(THREE, canvas);

        setCaption(body.caption);
        setLoading(false);

        observer = new ResizeObserver(() => fit());
        observer.observe(canvas);

        const started = performance.now();
        const tick = () => {
          if (cancelled || !api) return;
          const r = canvas.getBoundingClientRect();
          try {
            api.update((performance.now() - started) / 1000, r.width, r.height);
          } catch (e) {
            // One bad frame is the whole scene: stop rather than throw sixty
            // times a second into the console.
            setError(e instanceof Error ? e.message : String(e));
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      try {
        api?.dispose();
      } catch {
        // A scene that cannot clean up after itself must not break unmount.
      }
    };
  }, [slug]);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm">
        <canvas ref={canvasRef} className="block h-full w-full" />
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Drawing {slug}
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-gray-400">
            {error}
          </div>
        ) : null}
      </div>
      {caption ? <p className="mt-1.5 text-xs text-gray-500">{caption}</p> : null}
    </div>
  );
}
