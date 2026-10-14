import type { Messages } from "./i18n";
import { formatMessage } from "./text";

// Errors whose cause the extension knows, so the background can tell the
// user in the UI language; the English message stays for logs.
export const USER_ERROR_CODE = {
  noModel: "noModel",
  baseUrlRequired: "baseUrlRequired",
  providerConsent: "providerConsent",
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
