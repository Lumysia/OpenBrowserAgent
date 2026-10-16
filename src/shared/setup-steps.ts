// Guided setup, one thing per step. After the language, setup asks whether
// OpenBrowserAgent is new here: a first-time user sets up an AI provider
// and what to add to pages; a returning one syncs it all from another
// device. The step reached is kept for the browser session
// (setup-progress.ts), so setup reopened from the side panel goes on where
// it was left.
export const SETUP_PATHS = ["new", "returning"] as const;

export type SetupPath = (typeof SETUP_PATHS)[number];

// Every step, on either path.
export const SETUP_STEPS = [
  "language",
  "path",
  "provider",
  "pages",
  "sync",
  "passphrase",
  "download",
  "done",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

// Each path's steps. The returning path skips the AI provider and page
// steps: their settings come from the other device.
export const SETUP_PATH_STEPS = {
  new: ["language", "path", "provider", "pages", "done"],
  returning: ["language", "path", "sync", "passphrase", "download", "done"],
} as const satisfies Record<SetupPath, readonly SetupStep[]>;

// The path setup follows until one is chosen.
export const DEFAULT_SETUP_PATH: SetupPath = "new";

export const FIRST_SETUP_STEP: SetupStep = SETUP_STEPS[0];

// The step a first-time user goes on with when sync doesn't work out.
export const NEW_USER_SETUP_STEP: SetupStep = "provider";

export function isSetupStep(value: unknown): value is SetupStep {
  return SETUP_STEPS.includes(value as SetupStep);
}

export function isSetupPath(value: unknown): value is SetupPath {
  return SETUP_PATHS.includes(value as SetupPath);
}

// Where setup stands: its step, the path chosen, the AI provider it added
// (edited again when setup comes back to that step), and the settings tab
// that ran it again, with the settings page it showed, where setup goes
// back when it is done.
export type SetupProgress = {
  step: SetupStep;
  path?: SetupPath;
  providerId?: string;
  returnTo?: SetupReturn;
};

export type SetupReturn = { tabId: number; hash: string };

// What else decides the steps and whether each is done: a chat model, a
// sync backend on, and the synced keys (sealed with a passphrase on the
// server, and unlocked here).
export type SetupFacts = {
  hasChatModel: boolean;
  syncOn: boolean;
  keys?: { onServer: boolean; unlocked: boolean };
};

function setupReturn(value: unknown): SetupReturn | undefined {
  const { tabId, hash } = (value ?? {}) as Partial<SetupReturn>;
  return Number.isInteger(tabId) &&
    typeof hash === "string" &&
    hash.startsWith("#")
    ? { tabId: tabId!, hash }
    : undefined;
}

const pathSteps = (path: SetupPath | undefined): readonly SetupStep[] =>
  SETUP_PATH_STEPS[path ?? DEFAULT_SETUP_PATH];

// Where setup opens: as stored for this session, else at the first step.
// A step that isn't on the stored path starts over.
export function resumeSetupProgress(stored: unknown): SetupProgress {
  const value = (stored ?? {}) as Partial<SetupProgress>;
  const path = isSetupPath(value.path) ? value.path : undefined;
  const step =
    isSetupStep(value.step) && pathSteps(path).includes(value.step)
      ? value.step
      : FIRST_SETUP_STEP;
  const providerId =
    typeof value.providerId === "string" && value.providerId
      ? value.providerId
      : undefined;
  const returnTo = setupReturn(value.returnTo);
  return {
    step,
    ...(path && { path }),
    ...(providerId && { providerId }),
    ...(returnTo && { returnTo }),
  };
}

// The steps of the path setup is on, as the progress dots show them. The
// passphrase step is there only when synced keys are sealed with one (or
// setup is at it).
export function setupSteps(
  { step, path }: Pick<SetupProgress, "step" | "path">,
  { keys }: Pick<SetupFacts, "keys">,
): SetupStep[] {
  return pathSteps(path).filter(
    (item) => item !== "passphrase" || !!keys?.onServer || item === step,
  );
}

// The step after the current one; none after the last.
export function nextSetupStep(
  progress: Pick<SetupProgress, "step" | "path">,
  facts: Pick<SetupFacts, "keys">,
): SetupStep | undefined {
  const steps = setupSteps(progress, facts);
  const index = steps.indexOf(progress.step);
  return index < 0 ? undefined : steps[index + 1];
}

// The step before the current one; none before the first.
export function previousSetupStep(
  progress: Pick<SetupProgress, "step" | "path">,
  facts: Pick<SetupFacts, "keys">,
): SetupStep | undefined {
  const steps = setupSteps(progress, facts);
  const index = steps.indexOf(progress.step);
  return index > 0 ? steps[index - 1] : undefined;
}

// Whether the step is done: the path question once answered, the AI
// provider step with a chat model (added here, or arrived through sync),
// the sync step once sync is on, the passphrase step once the keys are
// unlocked. The others have defaults.
export function setupStepDone(
  { step, path }: Pick<SetupProgress, "step" | "path">,
  facts: SetupFacts,
) {
  switch (step) {
    case "path":
      return !!path;
    case "provider":
      return facts.hasChatModel;
    case "sync":
      return facts.syncOn;
    case "passphrase":
      return !!facts.keys?.unlocked;
    default:
      return true;
  }
}

// The forward action: "next" once the step is done, "skip" while it isn't,
// none on the last step. The sync step has no Skip: its own Connect goes on,
// and "Set up as a new user" leaves the path.
export function setupForwardAction(
  progress: Pick<SetupProgress, "step" | "path">,
  facts: SetupFacts,
): "next" | "skip" | undefined {
  if (!nextSetupStep(progress, facts)) return undefined;
  if (setupStepDone(progress, facts)) return "next";
  return progress.step === "sync" ? undefined : "skip";
}

// Answering the path question goes on to that path's next step.
export function chooseSetupPath(
  path: SetupPath,
  facts: Pick<SetupFacts, "keys">,
): Pick<SetupProgress, "step" | "path"> {
  return { path, step: nextSetupStep({ step: "path", path }, facts)! };
}

// Sync didn't work out (or brought no AI provider): on as a first-time
// user, at the AI provider step. Whatever sync connected stays.
export function setupAsNewUser(): Pick<SetupProgress, "step" | "path"> {
  return { path: "new", step: NEW_USER_SETUP_STEP };
}

// The last step says chat needs an AI provider while there is no model.
export function setupNeedsProviderNote(step: SetupStep, hasChatModel: boolean) {
  return step === "done" && !hasChatModel;
}
