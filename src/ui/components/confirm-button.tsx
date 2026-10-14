import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

// A destructive action that asks once: the first press turns the button
// into "Confirm" with a Cancel next to it, the second press runs it.
export function ConfirmButton({
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  variant = "destructiveOutline",
  ...props
}: Omit<ButtonProps, "onClick"> & {
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        {...props}
        variant={variant}
        onClick={() => {
          if (!asking) return setAsking(true);
          setAsking(false);
          onConfirm();
        }}
      >
        {asking ? confirmLabel : children}
      </Button>
      {asking && (
        <Button variant="secondary" onClick={() => setAsking(false)}>
          {cancelLabel}
        </Button>
      )}
    </>
  );
}
