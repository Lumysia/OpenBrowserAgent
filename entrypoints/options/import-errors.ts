import type { Messages } from "../../src/shared/i18n";
import type { WorkspaceErrorCode } from "../../src/shared/workspace-errors";
import { errorWithDetail, userErrorText } from "../../src/shared/user-errors";
import { skillTooLargeText } from "../../src/ui/skill-display";
import { workspaceErrorText } from "./workspace-error-text";

// Why an agent or skill archive could not be imported. The import helpers
// throw these; the page shows them in the UI language.
type ImportProblem =
  | { kind: "missingAgentManifest" }
  | { kind: "invalidAgentManifest" }
  | { kind: "missingSkillEntry" }
  | { kind: "skillTooLarge" }
  | { kind: "workspace"; code: WorkspaceErrorCode };

export class ImportError extends Error {
  constructor(readonly problem: ImportProblem) {
    super(problem.kind === "workspace" ? problem.code : problem.kind);
    this.name = "ImportError";
  }
}

function problemText(problem: ImportProblem, t: Messages) {
  switch (problem.kind) {
    case "missingAgentManifest":
      return t.options.importAgentPackageMissingManifest;
    case "invalidAgentManifest":
      return t.options.importAgentPackageInvalidManifest;
    case "missingSkillEntry":
      return t.options.importSkillPackageMissingEntry;
    case "skillTooLarge":
      return skillTooLargeText(t);
    case "workspace":
      return workspaceErrorText(problem.code, t);
  }
}

// "<lead>: <why>", with our own reasons in the UI language and anything
// else (a broken zip, unreadable JSON) as the error's own text.
export function importErrorText(lead: string, error: unknown, t: Messages) {
  return errorWithDetail(lead, importErrorDetail(error, t), t);
}

// Only the reason, for a notice that already names what failed.
export function importErrorDetail(error: unknown, t: Messages) {
  return error instanceof ImportError
    ? problemText(error.problem, t)
    : userErrorText(error, t);
}
