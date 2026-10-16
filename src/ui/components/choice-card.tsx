import * as React from "react";
import { cn } from "../utils";
import { Badge } from "./badge";

// A set of large choices, one card each (setup's questions).
export function ChoiceCards({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="group" className={cn("ui-choice-cards", className)} {...props} />
  );
}

// One choice: icon, title, what it means, and an optional badge
// ("Recommended"). `selected` marks the one chosen.
export function ChoiceCard({
  icon,
  title,
  description,
  badge,
  selected,
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("ui-choice-card", className)}
      aria-pressed={selected ?? false}
      data-state={selected ? "selected" : undefined}
      {...props}
    >
      <span className="ui-choice-card-icon" aria-hidden>
        {icon}
      </span>
      <span className="ui-choice-card-text">
        <span className="ui-choice-card-title">
          <strong>{title}</strong>
          {badge && <Badge>{badge}</Badge>}
        </span>
        {description && <small>{description}</small>}
      </span>
    </button>
  );
}
