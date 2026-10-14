import { TOOL_NAME } from "../../shared/tool-names";
import {
  deleteWorkspaceFile,
  normalizeWorkspacePath,
  patchWorkspaceFile,
  searchWorkspaceFiles,
  upsertWorkspaceFile,
} from "../../shared/workspace";
import { workspaceFailure } from "../../shared/workspace-errors";
import {
  mutateWorkspace,
  workspaceFileUnchanged,
} from "../../shared/workspace-storage";
import { fail, ok, schema, stringArg, type ToolDefinition } from "./types";

const WRITE_ACTIONS = ["write", "append", "replace", "delete"];
const ACTIONS = ["list", ...WRITE_ACTIONS, "search"];

// The agent's private files, memory included: MEMORY.md (lasting facts and
// lessons) and USER.md (the user's preferences) appear in the system prompt.
export const workspaceTool: ToolDefinition = {
  name: TOOL_NAME.workspace,
  onDemand: true,
  available: (run) => !!run.workspace,
  summary: "Edit the agent's files and memory (MEMORY.md, USER.md, notes)",
  description:
    'Change the agent\'s private files: list, write (path, content), append (path, content), replace (path, find, content: replaces the first occurrence of an exact text), delete (path), search (query). Remember lasting facts in MEMORY.md and user preferences in USER.md with short append entries; never store secrets. Read files with read "workspace:PATH".',
  parameters: schema(
    {
      action: { type: "string", enum: ACTIONS },
      path: { type: "string" },
      content: { type: "string" },
      find: { type: "string" },
      query: { type: "string" },
    },
    ["action"],
  ),
  async execute(input, { run }) {
    const workspace = run.workspace;
    if (!workspace) return fail("This agent has no workspace.");
    const action = stringArg(input.action);
    const path = stringArg(input.path);
    const content = String(input.content ?? "");
    if (action === "list")
      return ok(
        workspace.files
          .map((file) => `- ${file.path} (${file.content.length} chars)`)
          .join("\n") || "No files.",
        { action, count: workspace.files.length },
      );
    if (action === "search") {
      const query = stringArg(input.query);
      const { results } = searchWorkspaceFiles(workspace, query);
      return ok(
        results
          .map((item) => `${item.path}:${item.line}: ${item.preview}`)
          .join("\n") || `No match for "${query}".`,
        { action, query, matches: results.length },
      );
    }
    if (!WRITE_ACTIONS.includes(action))
      return fail(`Unknown action "${action}". Use ${ACTIONS.join(", ")}.`);
    if (!path) return fail("path is required.");
    const find = String(input.find ?? "");
    const normalized = normalizeWorkspacePath(path);
    // The file as it was when the change applied, for the receipt.
    let before: string | undefined;
    const result = await mutateWorkspace(workspace, (current) => {
      before = normalized.ok
        ? current.files.find((file) => file.path === normalized.path)?.content
        : undefined;
      if (action === "write")
        return upsertWorkspaceFile(current, path, content);
      if (action === "append")
        return before !== undefined
          ? patchWorkspaceFile(current, path, "append", appendedText(content))
          : upsertWorkspaceFile(current, path, content);
      if (action === "replace")
        return workspaceFileUnchanged(workspace, current, path)
          ? patchWorkspaceFile(current, path, "replace", content, find)
          : workspaceFailure("conflict");
      return deleteWorkspaceFile(current, path);
    });
    if (!result.ok) return fail(`${result.error} (${path})`, { action, path });
    const { text, details } = writeReceipt(
      action,
      result.file?.path || (normalized.ok ? normalized.path : path),
      before,
      result.file?.content,
      content,
      find,
    );
    return ok(text, { action, ...details });
  },
};

// An append starts on a new line unless its text already does.
function appendedText(content: string) {
  return content.startsWith("\n") ? content : `\n${content}`;
}

// What a change did to the file, for the model and the step's details.
function writeReceipt(
  action: string,
  path: string,
  before: string | undefined,
  after: string | undefined,
  content: string,
  find: string,
) {
  const sizes = `${before?.length ?? 0} → ${after?.length ?? 0} chars`;
  const chars = {
    charsBefore: before?.length ?? 0,
    charsAfter: after?.length ?? 0,
  };
  if (action === "delete")
    return {
      text: `Deleted ${path} (${before?.length ?? 0} chars).`,
      details: { path, deleted: true, charsBefore: before?.length ?? 0 },
    };
  if (action === "replace") {
    const occurrences = find && before ? before.split(find).length - 1 : 0;
    return {
      text: find
        ? `Replaced the first of ${occurrences} occurrence${occurrences === 1 ? "" : "s"} of the find text in ${path} (${sizes}).${occurrences > 1 ? " The others are unchanged; replace again with more context to change them." : ""}`
        : `Replaced the whole content of ${path} (empty find) (${sizes}).`,
      details: { path, occurrences, replaced: find ? 1 : 0, ...chars },
    };
  }
  if (action === "append" && before !== undefined) {
    const newlineAdded = appendedText(content) !== content;
    return {
      text: `Appended ${content.length} chars to ${path}${newlineAdded ? " on a new line (a newline was added before the text)" : " (the text started with a newline; none added)"} (${sizes}).`,
      details: { path, newlineAdded, ...chars },
    };
  }
  const created = before === undefined;
  return {
    text: `${created ? "Created" : "Overwrote"} ${path} (${sizes}).`,
    details: { path, created, ...chars },
  };
}
