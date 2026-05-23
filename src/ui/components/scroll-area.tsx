import * as React from "react";
import { cn } from "../utils";

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal" | "both";
    viewportRef?: React.Ref<HTMLDivElement>;
  }
>(
  (
    { className, children, orientation = "vertical", viewportRef, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn("ui-scroll-area", className)}
      data-orientation={orientation}
      {...props}
    >
      <div
        ref={viewportRef}
        className="ui-scroll-area-viewport"
        data-orientation={orientation}
      >
        {children}
      </div>
    </div>
  ),
);
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal";
  }
>(({ className, orientation = "vertical", ...props }, ref) => (
  <div
    ref={ref}
    data-orientation={orientation}
    className={cn("ui-scroll-area-scrollbar", className)}
    {...props}
  />
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
