import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "../utils";

const Accordion = AccordionPrimitive.Root;

const AccordionHeader = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Header>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Header>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Header
    ref={ref}
    className={cn("ui-accordion-header", className)}
    {...props}
  />
));
AccordionHeader.displayName = "AccordionHeader";

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("ui-accordion-item", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTriggerButton = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    hideChevron?: boolean;
  }
>(({ className, children, hideChevron = false, ...props }, ref) => (
  <AccordionPrimitive.Trigger
    ref={ref}
    className={cn("ui-accordion-trigger", className)}
    {...props}
  >
    {children}
    {!hideChevron && <ChevronDown className="ui-accordion-chevron" size={16} />}
  </AccordionPrimitive.Trigger>
));
AccordionTriggerButton.displayName = "AccordionTriggerButton";

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>((props, ref) => (
  <AccordionHeader>
    <AccordionTriggerButton ref={ref} {...props} />
  </AccordionHeader>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="ui-accordion-content"
    {...props}
  >
    <div className={cn("ui-accordion-content-inner", className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = "AccordionContent";

export {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
  AccordionTriggerButton,
};
