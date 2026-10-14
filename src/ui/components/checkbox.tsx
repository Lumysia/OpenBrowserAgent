import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../utils";

// A native checkbox with its label text; the whole row toggles it.
export function Checkbox({
  checked,
  onCheckedChange,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"input">, "type" | "checked" | "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <label className={cn("ui-checkbox", className)}>
      <input
        {...props}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {children && <span>{children}</span>}
    </label>
  );
}
