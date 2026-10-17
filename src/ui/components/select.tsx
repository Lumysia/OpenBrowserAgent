import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../utils";
import { usePortalContainer } from "./portal-container";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

// `inline`: a trigger that reads as part of a line of text, for a choice
// inside a sentence ("Translate into: French ▾").
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    variant?: "field" | "inline";
  }
>(({ className, children, variant = "field", ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "ui-select-trigger",
      variant === "inline" && "ui-select-trigger-inline",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown size={16} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
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
      <SelectPrimitive.ScrollUpButton className="ui-select-scroll">
        <ChevronUp size={14} />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="ui-select-viewport">
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="ui-select-scroll">
        <ChevronDown size={14} />
      </SelectPrimitive.ScrollDownButton>
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
