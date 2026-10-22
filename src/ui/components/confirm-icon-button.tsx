import { useId, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { IconTooltip } from "./tooltip";

// An icon-only destructive action that asks first in a small popover: the
// action as its title, what it does, then Cancel and the action. Cancel
// comes first so it takes the focus.
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
  const id = useId();
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
      <PopoverContent
        className="confirm-popover"
        align="end"
        role="alertdialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
      >
        <strong id={`${id}-title`}>{label}</strong>
        <p id={`${id}-text`}>{question}</p>
        <div className="confirm-popover-actions">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
