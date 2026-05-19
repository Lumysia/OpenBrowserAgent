import * as React from "react";
import { cn } from "../utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-skeleton", className)} {...props} />;
}

export { Skeleton };
