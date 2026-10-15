import { cn } from "../utils";

// Where a multi-step flow stands: one dot per step, the current one wide,
// the ones before it filled. `label` names the list; `stepLabel` says each
// step for screen readers ("Step 2 of 4: …").
export function StepDots({
  steps,
  current,
  label,
  stepLabel,
  className,
}: {
  steps: readonly string[];
  current: number;
  label: string;
  stepLabel: (index: number) => string;
  className?: string;
}) {
  return (
    <ol className={cn("ui-step-dots", className)} aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step}
          className="ui-step-dot"
          data-state={
            index === current
              ? "current"
              : index < current
                ? "complete"
                : "upcoming"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span className="visually-hidden">{stepLabel(index)}</span>
        </li>
      ))}
    </ol>
  );
}
