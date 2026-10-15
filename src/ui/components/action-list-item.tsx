import * as React from "react";
import { cn } from "../utils";
import { Button, type ButtonProps } from "./button";

// A row of a composer menu: icon, title and an optional hint under it.
export const ActionListItem = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "title"> & {
    icon: React.ReactNode;
    title: React.ReactNode;
    hint?: React.ReactNode;
    active?: boolean;
  }
>(({ icon, title, hint, active, className, children, ...props }, ref) => (
  <Button
    ref={ref}
    variant="ghost"
    className={cn("action-list-item", active && "active", className)}
    {...props}
  >
    {icon}
    <span>
      <strong>{title}</strong>
      {hint !== undefined && <small>{hint}</small>}
    </span>
    {children}
  </Button>
));
ActionListItem.displayName = "ActionListItem";
