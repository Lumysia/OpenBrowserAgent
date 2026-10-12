import { TOOL_NAME } from "../../shared/tool-names";
import {
  deleteWorkspaceFile,
  patchWorkspaceFile,
  searchWorkspaceFiles,
  upsertWorkspaceFile,
} from "../../shared/workspace";
import {
  mutateWorkspace,
  workspaceFileUnchanged,
  WORKSPACE_FILE_CONFLICT,
} from "../../shared/workspace-storage";
import { fail, ok, schema, stringArg, type ToolDefinition } from "./types";

const ACTIONS = ["list", "write", "append", "replace", "delete", "search"];

// The agent's private files, memory included: MEMORY.md (lasting facts and
// lessons) and USER.md (the user's preferences) appear in the system prompt.
export const workspaceTool: ToolDefinition = {
  name: TOOL_NAME.workspace,
  group: "workspace",
  onDemand: true,
  available: (run) => !!run.workspace,
  summary: "Edit the agent's files and memory (MEMORY.md, USER.md, notes)",
  description:
    'Change the agent\'s private files: list, write (path, content), append (path, content), replace (path, find, content: replace one exact text), delete (path), search (query). Remember lasting facts in MEMORY.md and user preferences in USER.md with short append entries; never store secrets. Read files with read "workspace:PATH".',
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
    if (!path) return fail("path is required.");
    const result = await mutateWorkspace(workspace, (current) => {
      if (action === "write")
        return upsertWorkspaceFile(current, path, content);
      if (action === "append")
        return current.files.some((file) => file.path === path)
          ? patchWorkspaceFile(
              current,
              path,
              "append",
              content.startsWith("\n") ? content : `\n${content}`,
            )
          : upsertWorkspaceFile(current, path, content);
      if (action === "replace")
        return workspaceFileUnchanged(workspace, current, path)
          ? patchWorkspaceFile(
              current,
              path,
              "replace",
              content,
              String(input.find ?? ""),
            )
          : { ok: false, error: WORKSPACE_FILE_CONFLICT };
      if (action === "delete") return deleteWorkspaceFile(current, path);
      return {
        ok: false,
        error: `Unknown action "${action}". Use ${ACTIONS.join(", ")}.`,
      };
    });
    if (!result.ok) return fail(`${result.error} (${path})`, { action, path });
    return ok(`${action} ${path}: done.`, { action, path });
  },
};
