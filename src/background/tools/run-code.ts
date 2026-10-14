import {
  CODE_LANGUAGE,
  CODE_RUN_LIMITS,
  codeRunTimeout,
  type CodeRunFile,
  type CodeRunResult,
} from "../../shared/code-sandbox/protocol";
import { TOOL_NAME } from "../../shared/tool-names";
import type { AgentWorkspace } from "../../shared/types";
import {
  normalizeWorkspacePath,
  upsertWorkspaceFile,
} from "../../shared/workspace";
import { mutateWorkspace } from "../../shared/workspace-storage";
import { runSandboxedCode } from "../code-sandbox";
import { fail, ok, schema, type ToolDefinition } from "./types";

// Model-written JavaScript in the bundled QuickJS interpreter: no network,
// no DOM, no extension APIs; workspace files go in and out as text.
export const runCodeTool: ToolDefinition = {
  name: TOOL_NAME.runCode,
  onDemand: true,
  summary:
    "Run JavaScript in a sandbox to compute, parse CSV/JSON or transform data",
  description: `Run JavaScript (ES2023) in an isolated interpreter and get its console output and the value of the last expression (as JSON). Use it for exact arithmetic and statistics, parsing and reshaping CSV/JSON/text, counting, sorting, dates, and checking numbers instead of estimating them. Globals: console.log/error, input (the JSON value you pass), readFile(path) and writeFile(path, text) for agent workspace files (list the files to read in files; written files are saved to the workspace). It cannot reach the network, web pages, the DOM, timers or npm packages: pass data in input or files, and get page content with the page tools first. Each call starts fresh. Limits: ${CODE_RUN_LIMITS.defaultTimeoutMs / 1000} s by default (timeoutMs up to ${CODE_RUN_LIMITS.maxTimeoutMs}), ${CODE_RUN_LIMITS.memoryBytes / 1024 / 1024} MB memory.`,
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
      timeoutMs: { type: "number" },
    },
    ["code"],
  ),
  async execute(input, { run, toolCallId, signal }) {
    const code = typeof input.code === "string" ? input.code : "";
    if (!code.trim()) return fail("code is required.");
    const files = readFiles(run.workspace, input.files);
    if (!files.ok) return fail(files.error);
    const result = await runSandboxedCode(
      {
        id: toolCallId,
        language: CODE_LANGUAGE.javascript,
        code,
        input: input.input,
        files: files.files,
        canWrite: !!run.workspace,
        timeoutMs: codeRunTimeout(input.timeoutMs),
      },
      signal,
    );
    signal?.throwIfAborted();
    const saved = await saveFiles(run.workspace, result.files);
    const text = resultText(result, saved);
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
    const normalized = normalizeWorkspacePath(item.replace(/^workspace:/, ""));
    const file = normalized.ok
      ? workspace?.files.find((entry) => entry.path === normalized.path)
      : undefined;
    if (!normalized.ok || !file)
      return {
        ok: false as const,
        error: `No workspace file "${item}". Files: ${
          workspace?.files.map((entry) => entry.path).join(", ") || "none"
        }.`,
      };
    files[file.path] = file.content;
  }
  return { ok: true as const, files };
}

type SavedFiles = {
  written: Array<{ path: string; chars: number }>;
  failed: Array<{ path: string; error: string }>;
};

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

function resultText(result: CodeRunResult, saved: SavedFiles) {
  const head = result.error
    ? `[The code failed after ${result.durationMs} ms]`
    : `[The code ran in ${result.durationMs} ms]`;
  return [
    head,
    result.output &&
      `Output:\n${result.output}${result.outputTruncated ? "\n[Output cut: a run prints at most ${CODE_RUN_LIMITS.outputMaxChars} characters.]" : ""}`,
    result.value !== undefined && `Result: ${result.value}`,
    result.error && `Error: ${result.error}`,
    ...saved.written.map(
      (file) => `Wrote workspace:${file.path} (${file.chars} chars).`,
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
