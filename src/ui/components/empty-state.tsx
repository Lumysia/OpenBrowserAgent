import type { ReactNode } from "react";
import { cn } from "../utils";

export const EMPTY_STATE_VARIANT = {
  // A dashed box where a settings list would be.
  card: "card",
  // A line in place of a list inside a panel or a section.
  plain: "plain",
  // The greeting of an empty page: a heading and a description.
  hero: "hero",
  // A muted line inside a form row.
  inline: "inline",
} as const;

export type EmptyStateVariant =
  (typeof EMPTY_STATE_VARIANT)[keyof typeof EMPTY_STATE_VARIANT];

// Stands in for something empty: what is missing, and the action that adds
// it.
export function EmptyState({
  icon,
  lead,
  title,
  description,
  action,
  variant = EMPTY_STATE_VARIANT.card,
  className,
}: {
  icon?: ReactNode;
  // Shown above the title, read by screen readers (unlike the icon).
  lead?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}) {
  const Title = variant === EMPTY_STATE_VARIANT.hero ? "h2" : "p";
  return (
    <div className={cn("ui-empty-state", className)} data-variant={variant}>
      {icon && (
        <span className="ui-empty-state-icon" aria-hidden>
          {icon}
        </span>
      )}
      {lead}
      <Title className="ui-empty-state-title">{title}</Title>
      {description && (
        <p className="ui-empty-state-description">{description}</p>
      )}
      {action}
    </div>
  );
}
