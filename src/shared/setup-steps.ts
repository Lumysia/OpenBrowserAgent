// Guided setup, one thing per step. The step reached is kept for the
// browser session (setup-progress.ts), so setup reopened from the side panel
// goes on where it was left.
export const SETUP_STEPS = ["language", "provider", "pages", "done"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export const FIRST_SETUP_STEP: SetupStep = SETUP_STEPS[0];

export function isSetupStep(value: unknown): value is SetupStep {
  return SETUP_STEPS.includes(value as SetupStep);
}

// Where setup stands: its step, and the AI provider it added (edited again
// when setup comes back to that step).
export type SetupProgress = { step: SetupStep; providerId?: string };

// Where setup opens: as stored for this session, else at the first step.
export function resumeSetupProgress(stored: unknown): SetupProgress {
  const value = (stored ?? {}) as Partial<SetupProgress>;
  const step = isSetupStep(value.step) ? value.step : FIRST_SETUP_STEP;
  return typeof value.providerId === "string" && value.providerId
    ? { step, providerId: value.providerId }
    : { step };
}

export function setupStepIndex(step: SetupStep) {
  return SETUP_STEPS.indexOf(step);
}

// The step after `step`; none after the last.
export function nextSetupStep(step: SetupStep): SetupStep | undefined {
  return SETUP_STEPS[setupStepIndex(step) + 1];
}

// The step before `step`; none before the first.
export function previousSetupStep(step: SetupStep): SetupStep | undefined {
  const index = setupStepIndex(step);
  return index > 0 ? SETUP_STEPS[index - 1] : undefined;
}

// What the step needs before it counts as done: the AI provider step a chat
// model (added here, or arrived through sync). The others have defaults.
export function setupStepDone(step: SetupStep, hasChatModel: boolean) {
  return step !== "provider" || hasChatModel;
}

// The forward action: "next" once the step is done, "skip" while it isn't,
// none on the last step.
export function setupForwardAction(
  step: SetupStep,
  hasChatModel: boolean,
): "next" | "skip" | undefined {
  if (!nextSetupStep(step)) return undefined;
  return setupStepDone(step, hasChatModel) ? "next" : "skip";
}

// The last step says chat needs an AI provider while there is no model.
export function setupNeedsProviderNote(step: SetupStep, hasChatModel: boolean) {
  return step === "done" && !hasChatModel;
}
