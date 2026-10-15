import type { Messages } from "../../src/shared/i18n";

// Where first-run cloud setup stands.
export type SetupStatus = "idle" | "synced" | "error";
// The step of a connection in progress: testing the backend, then pulling.
export type SetupAction = "test" | "confirm";

type Label = keyof Messages["sidepanel"];

const STATUS_MESSAGE = {
  synced: "cloudSyncSynced",
  error: "cloudSyncError",
} as const satisfies Record<Exclude<SetupStatus, "idle">, Label>;

const STATUS_ACTION = {
  idle: "cloudSyncConnect",
  synced: "cloudSyncSyncedButton",
  error: "cloudSyncConnect",
} as const satisfies Record<SetupStatus, Label>;

const RUNNING_ACTION = {
  test: "cloudSyncTesting",
  confirm: "cloudSyncPulling",
} as const satisfies Record<SetupAction, Label>;

// Once synced, providers come with the synced settings; the local start
// becomes the step to check them.
const START_LABEL = {
  idle: "startLocally",
  synced: "bootstrapStepProviderTitle",
  error: "startLocally",
} as const satisfies Record<SetupStatus, Label>;

// The texts of the first-run setup for where it stands.
export function describeSetupState(
  t: Messages,
  {
    status,
    running,
    codeInvalid,
  }: {
    status: SetupStatus;
    // The step of a connection in progress, if any.
    running?: SetupAction;
    codeInvalid: boolean;
  },
) {
  const actionLabel =
    t.sidepanel[running ? RUNNING_ACTION[running] : STATUS_ACTION[status]];
  return {
    actionLabel,
    feedback: running
      ? actionLabel
      : status === "idle"
        ? codeInvalid
          ? t.sidepanel.syncConfigCodeInvalid
          : ""
        : t.sidepanel[STATUS_MESSAGE[status]],
    feedbackError: status === "error" || codeInvalid,
    startLabel: t.sidepanel[START_LABEL[status]],
  };
}
