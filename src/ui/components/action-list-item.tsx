import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "../utils";
import { Button, type ButtonProps } from "./button";

// A row of a menu: icon, title and an optional hint under it. `active`
// highlights the row; `checked` also marks it as the current choice. Text
// that does not fit shows in full on hover.
export const ActionListItem = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "title"> & {
    icon: React.ReactNode;
    title: React.ReactNode;
    hint?: React.ReactNode;
    active?: boolean;
    checked?: boolean;
  }
>(
  (
    { icon, title, hint, active, checked, className, children, ...props },
    ref,
  ) => (
    <Button
      ref={ref}
      variant="ghost"
      className={cn(
        "action-list-item",
        (active || checked) && "active",
        className,
      )}
      {...props}
    >
      {icon}
      <span>
        <strong title={fullText(title)}>{title}</strong>
        {hint !== undefined && <small title={fullText(hint)}>{hint}</small>}
      </span>
      {children}
      {checked && <Check className="menu-check" size={14} aria-hidden />}
    </Button>
  ),
);
ActionListItem.displayName = "ActionListItem";

function fullText(node: React.ReactNode) {
  return typeof node === "string" ? node : undefined;
}
