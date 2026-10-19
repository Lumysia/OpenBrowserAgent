import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { IconTooltip } from "./tooltip";

// An icon-only destructive action that asks first in a small popover: what
// it does, the action, and Cancel.
export function ConfirmIconButton({
  icon,
  label,
  question,
  confirmLabel,
  cancelLabel,
  className,
  disabled,
  onConfirm,
}: {
  icon: ReactNode;
  label: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <IconTooltip label={label}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={label}
            disabled={disabled}
          >
            {icon}
          </Button>
        </PopoverTrigger>
      </IconTooltip>
      <PopoverContent className="settings-popover-content" align="end">
        <div className="settings-popover-menu" role="alertdialog">
          <p>{question}</p>
          <div className="row">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {cancelLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
