import * as React from "react";
import { cn } from "../utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// A square on/off tile: an icon over a short label, filled with the accent
// while on. `tooltip` says what it does, or why it is unavailable. An
// unavailable tile stays focusable (aria-disabled, not disabled), so the
// pointer and the keyboard still reach its reason; screen readers read
// the tooltip as the tile's description.
const ToggleTile = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
    icon: React.ReactNode;
    label: string;
    tooltip?: string;
    pressed: boolean;
    unavailable?: boolean;
    onPressedChange: (pressed: boolean) => void;
  }
>(
  (
    {
      icon,
      label,
      tooltip,
      pressed,
      unavailable = false,
      onPressedChange,
      className,
      ...props
    },
    ref,
  ) => {
    const descriptionId = React.useId();
    const tile = (
      <button
        ref={ref}
        type="button"
        className={cn("ui-toggle-tile", className)}
        aria-pressed={pressed}
        aria-disabled={unavailable || undefined}
        aria-describedby={tooltip ? descriptionId : undefined}
        data-state={pressed ? "on" : "off"}
        onClick={() => {
          if (!unavailable) onPressedChange(!pressed);
        }}
        {...props}
      >
        <span className="ui-toggle-tile-icon" aria-hidden>
          {icon}
        </span>
        <span className="ui-toggle-tile-label">{label}</span>
      </button>
    );
    if (!tooltip) return tile;
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>{tile}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
        {/* The tooltip for screen readers, also while it is closed. */}
        <span id={descriptionId} className="visually-hidden">
          {tooltip}
        </span>
      </>
    );
  },
);
ToggleTile.displayName = "ToggleTile";

export { ToggleTile };
