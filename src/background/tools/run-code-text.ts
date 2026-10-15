import type { CodeRunResult } from "../../shared/code-sandbox/protocol";
import { CODE_RUN_LIMITS } from "../../shared/config";
import { workspaceSource } from "./source-handles";

export type SavedFiles = {
  written: Array<{ path: string; chars: number }>;
  failed: Array<{ path: string; error: string }>;
};

const CUT_NOTE = `[Output cut: a run returns at most ${CODE_RUN_LIMITS.outputMaxChars} characters of output, result and error together.]`;

// What the model reads of a run.
export function runCodeText(result: CodeRunResult, saved: SavedFiles) {
  const head = result.error
    ? `[The code failed after ${result.durationMs} ms]`
    : `[The code ran in ${result.durationMs} ms]`;
  return [
    head,
    // Before the output: the tool output cap may hide what follows it.
    result.outputTruncated && CUT_NOTE,
    result.output && `Output:\n${result.output}`,
    result.value !== undefined && `Result: ${result.value}`,
    result.error && `Error: ${result.error}`,
    ...saved.written.map(
      (file) => `Wrote ${workspaceSource(file.path)} (${file.chars} chars).`,
    ),
    ...saved.failed.map(
      (file) => `Could not save ${file.path}: ${file.error}.`,
    ),
    !result.output &&
      result.value === undefined &&
      !result.error &&
      !saved.written.length &&
      "No output: print with console.log or end with an expression.",
  ]
    .filter(Boolean)
    .join("\n");
}
