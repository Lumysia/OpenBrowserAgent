import type { ReactNode } from "react";
import { Check, FlaskConical, Loader2 } from "lucide-react";
import { cn } from "../utils";
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerButton,
} from "./accordion";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// A settings row that opens: the summary opens it, the actions next to it
// (test, switch, delete…) do not, and a chevron button opens it too.
export function SettingsAccordionItem({
  value,
  summary,
  actions,
  chevronLabel,
  className,
  headerClassName,
  triggerClassName,
  actionsClassName,
  contentClassName,
  children,
}: {
  value: string;
  summary: ReactNode;
  actions?: ReactNode;
  chevronLabel: string;
  className?: string;
  headerClassName?: string;
  triggerClassName?: string;
  actionsClassName?: string;
  contentClassName?: string;
  children?: ReactNode;
}) {
  return (
    <AccordionItem value={value} className={className}>
      <AccordionHeader
        className={cn("ui-accordion-header-with-actions", headerClassName)}
      >
        <AccordionTriggerButton hideChevron className={triggerClassName}>
          {summary}
        </AccordionTriggerButton>
        {actions && (
          <span
            className={cn("accordion-trigger-actions", actionsClassName)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </span>
        )}
        <AccordionTriggerButton
          className="accordion-chevron-trigger"
          aria-label={chevronLabel}
        />
      </AccordionHeader>
      {children && (
        <AccordionContent className={contentClassName}>
          {children}
        </AccordionContent>
      )}
    </AccordionItem>
  );
}

export type TestState = "idle" | "testing" | "done";

// The icon button that tests a connection: a flask, a spinner while it
// runs, and a check for a moment after it passed.
export function TestButton({
  state,
  label,
  testingLabel,
  disabled,
  onClick,
}: {
  state: TestState;
  label: string;
  testingLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const shown = state === "testing" ? testingLabel : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events; the wrapper keeps the
            tooltip. */}
        <span className="tooltip-button-wrapper">
          <Button
            size="icon"
            aria-label={shown}
            disabled={disabled || state === "testing"}
            onClick={onClick}
          >
            {state === "testing" ? (
              <Loader2 size={14} className="spin" />
            ) : state === "done" ? (
              <Check size={14} />
            ) : (
              <FlaskConical size={14} />
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{shown}</TooltipContent>
    </Tooltip>
  );
}
