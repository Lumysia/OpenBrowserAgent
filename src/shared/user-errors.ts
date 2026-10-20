import type { Messages } from "./i18n";
import { formatMessage } from "./text";

// Errors whose cause the extension knows, so the background can tell the
// user in the UI language; the English message stays for logs.
export const USER_ERROR_CODE = {
  noModel: "noModel",
  noImageModel: "noImageModel",
  baseUrlRequired: "baseUrlRequired",
  providerConsent: "providerConsent",
  bridgeNotFound: "bridgeNotFound",
  bridgeHostRequired: "bridgeHostRequired",
  bridgeTimeout: "bridgeTimeout",
  syncKeysLocked: "syncKeysLocked",
  // Teach mode: the page can't be recorded; the agent may not work in a
  // tab while it is recorded.
  teachUnscriptable: "teachUnscriptable",
  tabRecording: "tabRecording",
  // Teach mode: nothing was recorded; the model wrote no instructions; the
  // recording (or the recorded skill) is gone; the check's tab didn't open.
  teachEmpty: "teachEmpty",
  teachNoInstructions: "teachNoInstructions",
  teachGone: "teachGone",
  teachCheckTab: "teachCheckTab",
  // Teach mode: another recording is open; the agent works in the tab.
  teachBusy: "teachBusy",
  teachTabBusy: "teachTabBusy",
} as const;

export type UserErrorCode =
  (typeof USER_ERROR_CODE)[keyof typeof USER_ERROR_CODE];

export class UserError extends Error {
  constructor(
    readonly code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

// A request was stopped before anything was sent: the provider lacks the
// user's permission to receive their content (see provider-consent.ts).
export class ProviderConsentError extends UserError {
  constructor(
    readonly providerId: string,
    readonly host: string,
  ) {
    super(
      USER_ERROR_CODE.providerConsent,
      `Sending content to ${host} needs the user's permission.`,
    );
  }
}

// What a UI shows for a failed run: the localized text of a known error,
// else the error's own message.
export function userErrorText(error: unknown, t: Messages) {
  if (!(error instanceof UserError))
    return (error as Error | undefined)?.message || String(error);
  if (error instanceof ProviderConsentError)
    return formatMessage(t.providerConsent.required, { host: error.host });
  return t.display.errors[error.code as keyof Messages["display"]["errors"]];
}

// "<what failed>: <why>". `lead` is in the UI language; so is the reason
// when it is one of ours, else it is a server's or the browser's own text.
export function errorWithDetail(lead: string, error: unknown, t: Messages) {
  const detail =
    error instanceof Error && !(error instanceof UserError)
      ? error.message
      : error == null
        ? ""
        : userErrorText(error, t);
  return detail.trim()
    ? formatMessage(t.common.errorDetail, { message: lead, detail })
    : lead;
}
