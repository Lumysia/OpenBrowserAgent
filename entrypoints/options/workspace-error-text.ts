import {
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_PATH_MAX_LENGTH,
  WORKSPACE_TOTAL_MAX_CHARS,
} from "../../src/shared/config";
import { formatNumber } from "../../src/shared/format";
import { languageOf, type Messages } from "../../src/shared/i18n";
import type { WorkspaceErrorCode } from "../../src/shared/workspace-errors";

const LIMITS: Partial<Record<WorkspaceErrorCode, number>> = {
  pathTooLong: WORKSPACE_PATH_MAX_LENGTH,
  fileTooLarge: WORKSPACE_FILE_MAX_CHARS,
  workspaceTooLarge: WORKSPACE_TOTAL_MAX_CHARS,
};

// A failed workspace change, in the UI language (the tools get the English
// `error` text instead).
export function workspaceErrorText(code: WorkspaceErrorCode, t: Messages) {
  const limit = LIMITS[code];
  const text = t.options.agentWorkspaceErrors[code];
  return limit === undefined
    ? text
    : text.replaceAll("{limit}", formatNumber(languageOf(t), limit));
}
