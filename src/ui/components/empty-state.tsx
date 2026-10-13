import type { ReactNode } from "react";
import { cn } from "../utils";

// Stands in for an empty list: what is missing and the action that adds it.
export function EmptyState({
  icon,
  title,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ui-empty-state", className)}>
      {icon && (
        <span className="ui-empty-state-icon" aria-hidden>
          {icon}
        </span>
      )}
      <p className="ui-empty-state-title">{title}</p>
      {action}
    </div>
  );
}
