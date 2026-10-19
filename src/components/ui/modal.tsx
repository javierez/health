"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * The panel's detail, on a click: a native dialog, closed by Esc, the backdrop
 * or the cross. The content mounts only while open, so it does not animate
 * hidden and starts fresh each time.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) {
      d?.showModal();
      // The dialog itself takes the focus, not the cross: no ring on opening.
      d?.focus();
    }
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto max-h-[85dvh] outline-none w-[min(92vw,30rem)] overflow-y-auto rounded-2xl bg-white p-0 shadow-xl backdrop:bg-gray-900/30 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open ? (
        <div className="p-5 animate-fade-in motion-reduce:animate-none">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-m-1 rounded-full p-1 text-gray-400 outline-none transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
