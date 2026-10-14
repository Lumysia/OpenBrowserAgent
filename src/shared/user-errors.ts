import type { Messages } from "./i18n";

// Errors whose cause the extension knows, so the background can tell the
// user in the UI language; the English message stays for logs.
export const USER_ERROR_CODE = {
  noModel: "noModel",
  baseUrlRequired: "baseUrlRequired",
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

// What a UI shows for a failed run: the localized text of a known error,
// else the error's own message.
export function userErrorText(error: unknown, t: Messages) {
  if (error instanceof UserError) return t.display.errors[error.code];
  return (error as Error | undefined)?.message || String(error);
}
