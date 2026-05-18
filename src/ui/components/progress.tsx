import * as React from "react";
import { cn } from "../utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export type ProgressSegment = {
  key: string;
  value: number;
  className?: string;
  tooltip?: string;
};

export function Progress({
  value,
  segments,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value?: number;
  segments?: ProgressSegment[];
}) {
  const total = segments?.reduce((sum, segment) => sum + segment.value, 0) || 0;
  return (
    <div className={cn("ui-progress", className)} role="progressbar" {...props}>
      {segments?.length && total ? (
        segments.map((segment) => {
          const segmentElement = (
            <div
              className={cn("ui-progress-segment", segment.className)}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          );
          return segment.tooltip ? (
            <Tooltip key={segment.key}>
              <TooltipTrigger asChild>{segmentElement}</TooltipTrigger>
              <TooltipContent>{segment.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <React.Fragment key={segment.key}>{segmentElement}</React.Fragment>
          );
        })
      ) : (
        <div
          className="ui-progress-indicator"
          style={{ width: `${Math.max(0, Math.min(value || 0, 100))}%` }}
        />
      )}
    </div>
  );
}
