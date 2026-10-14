import {
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_PATH_MAX_LENGTH,
  WORKSPACE_TOTAL_MAX_CHARS,
} from "./config";

// Why a workspace change failed. `error` is the English text the agent's
// tools return; the settings editor shows `code` in the UI language.
export const WORKSPACE_ERROR_TEXT = {
  pathRequired: "Path is required",
  pathTooLong: `Path must be ${WORKSPACE_PATH_MAX_LENGTH} characters or less`,
  relativePath: "Path cannot contain relative segments",
  fileTooLarge: `File content must be ${WORKSPACE_FILE_MAX_CHARS} characters or less`,
  workspaceTooLarge: `Workspace content must be ${WORKSPACE_TOTAL_MAX_CHARS} characters or less`,
  fileNotFound: "Workspace file not found",
  findNotFound: "Text to replace was not found",
  workspaceNotFound: "Workspace not found",
  conflict:
    "Workspace file changed since it was read. Read the current file before editing it.",
} as const;

export type WorkspaceErrorCode = keyof typeof WORKSPACE_ERROR_TEXT;

export type WorkspaceFailure = {
  ok: false;
  code: WorkspaceErrorCode;
  error: string;
};

export function workspaceFailure(code: WorkspaceErrorCode): WorkspaceFailure {
  return { ok: false, code, error: WORKSPACE_ERROR_TEXT[code] };
}
