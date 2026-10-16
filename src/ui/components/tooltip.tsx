import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "../utils";
import { usePortalContainer } from "./portal-container";

// Tooltips hold text only, so they close as soon as the pointer leaves the
// trigger. Radix's default keeps them open while the pointer crosses to the
// tooltip and closes them on the next pointer move in this document; a pointer
// that leaves the side panel quickly for the web page sends no more moves
// here, and the tooltip stayed open.
function TooltipProvider(
  props: React.ComponentProps<typeof TooltipPrimitive.Provider>,
) {
  return <TooltipPrimitive.Provider disableHoverableContent {...props} />;
}
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, children, ...props }, ref) => (
  <TooltipPrimitive.Portal container={usePortalContainer()}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn("ui-tooltip-content", className)}
      {...props}
    >
      {children}
      {/* Points at the trigger, so a tooltip near other controls is not
          read as theirs. */}
      <TooltipPrimitive.Arrow asChild width={12} height={6}>
        <svg className="ui-tooltip-arrow" viewBox="0 0 12 6" aria-hidden>
          <path d="M0 0 L6 6 L12 0 Z" />
          <path d="M0 0 L6 6 L12 0" fill="none" />
        </svg>
      </TooltipPrimitive.Arrow>
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

// An icon-only control's visible label.
function IconTooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

// Detail behind an info icon, for text only needed on demand. The icon is a
// focusable button so keyboard users can reach the tooltip.
function InfoTip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="ui-info-tip" aria-label={label}>
          <Info size={14} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="ui-info-tip-content">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  IconTooltip,
  InfoTip,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
};
