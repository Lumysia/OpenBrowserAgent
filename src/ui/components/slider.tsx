import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../utils";

// A single-value slider. `label` names its thumb for assistive technology.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    label: string;
  }
>(({ className, label, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("ui-slider", className)}
    {...props}
  >
    <SliderPrimitive.Track className="ui-slider-track">
      <SliderPrimitive.Range className="ui-slider-range" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="ui-slider-thumb" aria-label={label} />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
