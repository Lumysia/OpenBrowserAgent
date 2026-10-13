import * as React from "react";
import { cn } from "../utils";

// `inset` pads the viewport by --scroll-inset and pulls the area out by the
// same amount, so shadows and focus rings of the content are not clipped while
// the content keeps its place in the layout.
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal" | "both";
    viewportRef?: React.Ref<HTMLDivElement>;
    inset?: boolean;
  }
>(
  (
    {
      className,
      children,
      orientation = "vertical",
      viewportRef,
      inset,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "ui-scroll-area",
        inset && "ui-scroll-area-inset",
        className,
      )}
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

export { ScrollArea };
