import {
  TEACH_LIMITS,
  TEACH_STEP_KIND,
  type TeachEvent,
  type TeachStep,
  type TeachTarget,
} from "./types";

// Turns what the page reports into the recording's steps, leaving out the
// noise a person makes: the same action twice, a field committed again, Enter
// after typing (one "type and submit" step), and a navigation a click
// caused. A recording keeps at most TEACH_LIMITS.maxSteps steps.

type Limits = Pick<
  typeof TEACH_LIMITS,
  "maxSteps" | "duplicateMs" | "causedNavigationMs"
>;

export type StepChange = {
  steps: TeachStep[];
  // The step was left out because the recording is full.
  dropped: boolean;
};

export function targetKey(target: TeachTarget | undefined) {
  if (!target) return "";
  return [
    target.role,
    target.name,
    target.label,
    target.nameAttribute,
    target.id,
    target.href,
    target.path,
  ].join("\u0000");
}

const sameTarget = (a: TeachStep, b: TeachEvent) =>
  targetKey(a.target) === targetKey(b.target);

function isRepeat(last: TeachStep, event: TeachEvent, limits: Limits) {
  return (
    last.kind === event.kind &&
    sameTarget(last, event) &&
    last.choice === event.choice &&
    last.checked === event.checked &&
    last.key === event.key &&
    event.at - last.at <= limits.duplicateMs
  );
}

const replaceLast = (steps: TeachStep[], step: TeachStep) => [
  ...steps.slice(0, -1),
  step,
];

export function addTeachStep(
  steps: TeachStep[],
  event: TeachEvent,
  limits: Limits = TEACH_LIMITS,
): StepChange {
  const last = steps.at(-1);
  if (last && isRepeat(last, event, limits)) return { steps, dropped: false };
  // A field committed again (blur after Enter, a second edit right away)
  // is one entry: the latest.
  if (
    last?.kind === TEACH_STEP_KIND.field &&
    event.kind === TEACH_STEP_KIND.field &&
    sameTarget(last, event)
  )
    return {
      steps: replaceLast(steps, {
        ...last,
        at: event.at,
        field: {
          ...event.field!,
          submitted: !!(last.field?.submitted || event.field?.submitted),
          example: last.field?.example,
        },
      }),
      dropped: false,
    };
  // Enter in the field just typed in: typed and submitted.
  if (
    last?.kind === TEACH_STEP_KIND.field &&
    event.kind === TEACH_STEP_KIND.key &&
    event.key === "Enter" &&
    sameTarget(last, event)
  )
    return {
      steps: replaceLast(steps, {
        ...last,
        field: { ...last.field!, submitted: true },
      }),
      dropped: false,
    };
  // Another tab of the same site again.
  if (
    last?.kind === TEACH_STEP_KIND.switchTab &&
    event.kind === TEACH_STEP_KIND.switchTab &&
    last.site === event.site
  )
    return { steps, dropped: false };
  if (steps.length >= limits.maxSteps) return { steps, dropped: true };
  return { steps: [...steps, { ...event }], dropped: false };
}

// Steps whose result may be a new page.
const CAUSES_NAVIGATION = new Set<TeachStep["kind"]>([
  TEACH_STEP_KIND.click,
  TEACH_STEP_KIND.key,
  TEACH_STEP_KIND.choose,
  TEACH_STEP_KIND.field,
]);

// A page the recording's tab moved to. One the last step caused (within
// causedNavigationMs) becomes that step's result; one the user went to
// (typed URL, bookmark, back) is a step.
export function addNavigation(
  steps: TeachStep[],
  event: TeachEvent,
  limits: Limits = TEACH_LIMITS,
): StepChange {
  const last = steps.at(-1);
  const url = event.page.url;
  if (!url) return { steps, dropped: false };
  if (last && (last.leadsTo || last.page.url) === url)
    return { steps, dropped: false };
  if (
    last &&
    CAUSES_NAVIGATION.has(last.kind) &&
    (last.kind !== TEACH_STEP_KIND.field || last.field?.submitted) &&
    event.at - last.at <= limits.causedNavigationMs
  )
    return {
      steps: replaceLast(steps, { ...last, leadsTo: url }),
      dropped: false,
    };
  if (steps.length >= limits.maxSteps) return { steps, dropped: true };
  return {
    steps: [...steps, { ...event, kind: TEACH_STEP_KIND.navigate }],
    dropped: false,
  };
}

// The page the recording is on after its steps.
export function currentPage(steps: TeachStep[], startUrl: string) {
  const last = steps.at(-1);
  return last ? last.leadsTo || last.page.url : startUrl;
}
