import { ALL_MESSAGES, type Messages } from "../shared/i18n";
import { formatMessage } from "../shared/text";

// The reason of a failure stored before only the reason was kept: such
// values were stored as "<lead>: <reason>" (or the bare lead) in the UI
// language of the time. Drops that lead in whichever language it was, so
// it does not show twice; values stored since, and errors that are not
// text, come back as they are.
export function storedErrorReason<T>(
  value: T | string,
  lead: (t: Messages) => string,
) {
  if (typeof value !== "string") return value;
  for (const t of ALL_MESSAGES) {
    const text = lead(t);
    if (value === text) return "";
    const prefix = formatMessage(t.common.errorDetail, {
      message: text,
      detail: "",
    });
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return value;
}
