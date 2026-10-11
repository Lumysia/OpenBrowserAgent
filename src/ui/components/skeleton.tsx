import type { HTMLAttributes } from "react";
import { cn } from "../utils";

// Placeholder block with the shared loading shimmer.
export function Skeleton({
  loading = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { loading?: boolean }) {
  return (
    <div
      aria-hidden="true"
      {...props}
      data-loading={loading}
      className={cn("ui-skeleton", className)}
    />
  );
}
