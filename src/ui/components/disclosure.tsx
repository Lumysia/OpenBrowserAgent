import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../utils";
import { Button } from "./button";

// A labelled toggle that shows its content below it: expert settings under
// "Advanced", or a rarely needed step such as joining sync at first run.
export function Disclosure({
  label,
  defaultOpen = false,
  className,
  triggerClassName,
  contentClassName,
  children,
}: {
  label: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn("ui-disclosure", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("ui-disclosure-trigger", triggerClassName)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronDown size={14} className="ui-accordion-chevron" />
      </Button>
      {open && (
        <div id={id} className={cn("ui-disclosure-content", contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
