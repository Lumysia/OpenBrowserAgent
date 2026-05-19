import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "../utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    orientation?: "vertical" | "horizontal" | "both";
    viewportRef?: React.Ref<HTMLDivElement>;
  }
>(
  (
    { className, children, orientation = "vertical", viewportRef, ...props },
    ref,
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("ui-scroll-area", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className="ui-scroll-area-viewport"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === "vertical" || orientation === "both") && <ScrollBar />}
      {(orientation === "horizontal" || orientation === "both") && (
        <ScrollBar orientation="horizontal" />
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  ),
);
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn("ui-scroll-area-scrollbar", className)}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="ui-scroll-area-thumb" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
