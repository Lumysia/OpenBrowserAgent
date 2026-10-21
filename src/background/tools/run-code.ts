import {
  CODE_LANGUAGE,
  codeRunTimeout,
  type CodeRunFile,
} from "../../shared/code-sandbox/protocol";
import {
  BYTES_PER_MIB,
  CODE_RUN_LIMITS,
  MS_PER_SECOND,
} from "../../shared/config";
import { TOOL_NAME } from "../../shared/tool-names";
import type { AgentWorkspace } from "../../shared/types";
import { upsertWorkspaceFile } from "../../shared/workspace";
import { mutateWorkspace } from "../../shared/workspace-storage";
import { runSandboxedCode } from "../code-sandbox";
import { runCodeText, type SavedFiles } from "./run-code-text";
import { fail, mayChange, ok, schema, type ToolDefinition } from "./types";
import { findWorkspaceFile } from "./workspace-source";

// Model-written JavaScript in the bundled QuickJS interpreter: no network,
// no DOM, no extension APIs; workspace files go in and out as text.
export const runCodeTool: ToolDefinition = {
  name: TOOL_NAME.runCode,
  // Saving written files changes the workspace (MEMORY.md, USER.md): only
  // in runs that may act.
  effects: {
    byRun: {
      readOnlyNote:
        "In this run writeFile is not available: it runs on its own and may only read. Print results instead.",
    },
  },
  onDemand: true,
  summary:
    "Run JavaScript in a sandbox to compute, parse CSV/JSON or transform data",
  description: `Run JavaScript (ES2023) in an isolated interpreter and get its console output and the value of the last expression (as JSON). Use it for exact arithmetic and statistics, parsing and reshaping CSV/JSON/text, counting, sorting, dates, and checking numbers instead of estimating them. Date works in the user's local time zone; Intl (time zones, number and date formats, Collator, Segmenter) and toLocaleString/localeCompare are the browser's; there is no Temporal. Globals: console.log/error, input (the JSON value you pass), readFile(path) and writeFile(path, text) for agent workspace files (list the files to read in files; written files are saved to the workspace). It cannot reach the network, web pages, the DOM, timers or npm packages: pass data in input or files, and get page content with the page tools first. Each call starts fresh. Limits: ${CODE_RUN_LIMITS.defaultTimeoutMs / MS_PER_SECOND} s by default (timeoutMs up to ${CODE_RUN_LIMITS.maxTimeoutMs}), ${CODE_RUN_LIMITS.memoryBytes / BYTES_PER_MIB} MB memory; written files follow the workspace limits.`,
  parameters: schema(
    {
      code: {
        type: "string",
        description:
          "JavaScript to run. The value of the last expression is returned; print with console.log.",
      },
      input: { description: "Any JSON value, available as `input`." },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Workspace file paths readFile may read.",
      },
      timeoutMs: {
        type: "number",
        description: `Time limit in ms: ${CODE_RUN_LIMITS.defaultTimeoutMs} by default, at most ${CODE_RUN_LIMITS.maxTimeoutMs}.`,
      },
    },
    ["code"],
  ),
  async execute(input, { run, toolCallId, signal }) {
    const code = typeof input.code === "string" ? input.code : "";
    if (!code.trim()) return fail("code is required.");
    const readOnly = !mayChange(run);
    const files = readFiles(run.workspace, input.files);
    if (!files.ok) return fail(files.error);
    const result = await runSandboxedCode(
      {
        id: toolCallId,
        language: CODE_LANGUAGE.javascript,
        code,
        input: input.input,
        files: files.files,
        ...(run.workspace
          ? {
              workspaceFiles: Object.fromEntries(
                run.workspace.files.map((file) => [
                  file.path,
                  file.content.length,
                ]),
              ),
            }
          : {}),
        ...(readOnly ? { readOnly } : {}),
        timeoutMs: codeRunTimeout(input.timeoutMs),
      },
      signal,
    );
    signal?.throwIfAborted();
    const saved = await saveFiles(
      readOnly ? undefined : run.workspace,
      result.files,
    );
    const text = runCodeText(result, saved);
    const details = {
      language: CODE_LANGUAGE.javascript,
      durationMs: result.durationMs,
      ...(result.isolation ? { isolation: result.isolation } : {}),
      files: saved.written,
      ...(saved.failed.length ? { failedFiles: saved.failed } : {}),
      ...(result.stopped ? { stopped: result.stopped } : {}),
    };
    return result.error || saved.failed.length
      ? fail(text, details)
      : ok(text, details);
  },
};

function readFiles(workspace: AgentWorkspace | undefined, value: unknown) {
  const paths = Array.isArray(value) ? value.map(String) : [];
  const files: Record<string, string> = {};
  if (paths.length && !workspace)
    return {
      ok: false as const,
      error:
        "This agent has no workspace to read files from; pass the data in input instead.",
    };
  for (const item of paths) {
    if (!workspace) break;
    const found = findWorkspaceFile(workspace, item);
    if (!found.ok) return found;
    files[found.file.path] = found.file.content;
  }
  return { ok: true as const, files };
}

// Files the code wrote, saved together in one workspace change. A file that
// cannot be saved (bad path, too large) is reported; the others still are.
async function saveFiles(
  workspace: AgentWorkspace | undefined,
  files: CodeRunFile[],
): Promise<SavedFiles> {
  const saved: SavedFiles = { written: [], failed: [] };
  if (!workspace || !files.length) return saved;
  const result = await mutateWorkspace(workspace, (current) => {
    saved.written = [];
    saved.failed = [];
    let next = current;
    for (const file of files) {
      const change = upsertWorkspaceFile(next, file.path, file.content);
      if (!change.ok) {
        saved.failed.push({ path: file.path, error: change.error });
        continue;
      }
      next = change.workspace;
      saved.written.push({
        path: change.file?.path || file.path,
        chars: file.content.length,
      });
    }
    return { ok: true, workspace: next };
  });
  if (!result.ok)
    return {
      written: [],
      failed: files.map((file) => ({ path: file.path, error: result.error })),
    };
  return saved;
}
