"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "~/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    // `flex flex-col` pairs with the viewport's `flex-auto min-h-0` below.
    className={cn("relative flex flex-col overflow-hidden", className)}
    {...props}
  >
    {/*
      `flex-auto min-h-0` is load-bearing, not styling. On its own, the
      viewport's `h-full` is a *percentage* height, which resolves only when the
      Root has a definite height. Two very common callers don't give it one:
      a Root sized by `max-h-*` alone, and a Root that is a `flex-1` child of a
      container sized by `max-h-*`. In both, the viewport stayed as tall as its
      content, and the Root's `overflow-hidden` clipped the overflow with no
      scrollbar and no way to reach it. As a flex item that may shrink, the
      viewport is capped by whatever height the Root actually ends up with, so
      it scrolls in every case. Roots with a definite height behave as before,
      and content shorter than the cap still shrinks to fit rather than being
      stretched.
    */}
    <ScrollAreaPrimitive.Viewport className="h-full min-h-0 w-full flex-auto overflow-y-auto overflow-x-hidden rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<
    typeof ScrollAreaPrimitive.ScrollAreaScrollbar
  > & {
    thumbClassName?: string;
  }
>(({ className, orientation = "vertical", thumbClassName, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn("relative flex-1 rounded-full bg-border", thumbClassName)}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
