import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "../utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// `layout="grid"` wraps the items onto rows of tiles (set the tile's least
// width with --toggle-group-item-min); the default is one segmented row.
const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> & {
    size?: "default" | "sm";
    layout?: "row" | "grid";
  }
>(({ className, size = "default", layout = "row", ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      "ui-toggle-group",
      size === "sm" && "ui-toggle-group-sm",
      layout === "grid" && "ui-toggle-group-grid",
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

// `tooltip` explains the option. The item renders through the trigger so the
// toggle keeps its own `data-state` (on/off) instead of the tooltip's.
const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & {
    tooltip?: string;
  }
>(({ className, tooltip, children, ...props }, ref) => {
  const item = (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn("ui-toggle-group-item", className)}
      asChild={!!tooltip}
      {...props}
    >
      {tooltip ? <TooltipTrigger>{children}</TooltipTrigger> : children}
    </ToggleGroupPrimitive.Item>
  );
  if (!tooltip) return item;
  return (
    <Tooltip>
      {item}
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
});
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
