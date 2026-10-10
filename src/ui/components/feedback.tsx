import type { HTMLAttributes } from "react";
import { cn } from "../utils";

export function Feedback({
  error = false,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { error?: boolean }) {
  return (
    <p
      {...props}
      role={error ? "alert" : "status"}
      className={cn("ui-card-description", className)}
    />
  );
}
