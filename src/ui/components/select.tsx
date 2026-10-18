import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../utils";
import { usePortalContainer } from "./portal-container";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

// The keys a closed trigger opens on or picks a value with (typeahead).
const isSelectKey = (event: React.KeyboardEvent) =>
  !event.ctrlKey &&
  !event.altKey &&
  !event.metaKey &&
  (event.key.length === 1 ||
    ["Enter", "ArrowUp", "ArrowDown"].includes(event.key));

// `inline`: a trigger that reads as part of a line of text, for a choice
// inside a sentence ("Translate into: French ▾"). `unavailableReason`: the
// choice can't be changed now, and why. Unlike `disabled`, the trigger stays
// focusable and keeps pointer events (aria-disabled), so hovering or focusing
// it shows the reason; screen readers read it as the trigger's description.
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    variant?: "field" | "inline";
    unavailableReason?: string;
  }
>(
  (
    { className, children, variant = "field", unavailableReason, ...props },
    ref,
  ) => {
    const descriptionId = React.useId();
    // Prevented events skip Radix's own handlers, which open the list.
    const block = (event: React.SyntheticEvent) => event.preventDefault();
    const trigger = (
      <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
          "ui-select-trigger",
          variant === "inline" && "ui-select-trigger-inline",
          className,
        )}
        {...props}
        {...(unavailableReason && {
          "aria-disabled": true,
          "aria-describedby": descriptionId,
          onPointerDown: block,
          onClick: block,
          onKeyDown: (event: React.KeyboardEvent) => {
            if (isSelectKey(event)) block(event);
          },
        })}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    );
    if (!unavailableReason) return trigger;
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>{unavailableReason}</TooltipContent>
        </Tooltip>
        {/* The reason for screen readers, also while the tooltip is closed. */}
        <span id={descriptionId} className="visually-hidden">
          {unavailableReason}
        </span>
      </>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal container={usePortalContainer()}>
    <SelectPrimitive.Content
      ref={ref}
      className={cn("ui-select-content", className)}
      position="popper"
      {...props}
    >
      <SelectPrimitive.Viewport className="ui-select-viewport">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn("ui-select-item", className)}
    {...props}
  >
    <span className="ui-select-item-indicator">
      <SelectPrimitive.ItemIndicator>
        <Check size={14} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
