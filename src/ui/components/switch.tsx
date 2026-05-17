import * as React from "react";
import { cn } from "../utils";

export const Switch = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange"> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
>(
  (
    { checked = false, className, onCheckedChange, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn("ui-switch", checked && "checked", className)}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      {...props}
    >
      <span />
    </button>
  ),
);
Switch.displayName = "Switch";
