import type { Messages } from "../shared/i18n";
import { UserError, userErrorText } from "../shared/user-errors";
import { formatMessage } from "../shared/text";

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
