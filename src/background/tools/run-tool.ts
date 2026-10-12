import { assignChatSources } from "../../shared/chat-sources";
import { withCancellationTimeout } from "../../shared/cancellation";
import { BROWSER_TOOL_TIMEOUT_MS } from "../../shared/config";
import type { ChatSource } from "../../shared/types";
import {
  errorMessage,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./types";

// Groups whose tools talk to pages, where a dialog or a hung page could
// otherwise stall the run.
const TIMED_GROUPS = new Set(["pages", "browser", "web"]);

export type ToolOutcome = {
  // What the model reads.
  text: string;
  // What the side panel stores and shows.
  output: Record<string, unknown>;
  image?: ToolResult["image"];
  isError: boolean;
};

export async function runTool(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext,
  // The run's citation sources; updated in place when a result adds some.
  sources: { current: ChatSource[] },
): Promise<ToolOutcome> {
  // A run stopped before dispatch must not touch tabs, fetch, or storage.
  context.signal?.throwIfAborted();
  let result: ToolResult;
  const timeout =
    tool.timeoutMs ??
    (tool.group && TIMED_GROUPS.has(tool.group) ? BROWSER_TOOL_TIMEOUT_MS : 0);
  try {
    result = timeout
      ? await withCancellationTimeout(
          (signal) => tool.execute(input, { ...context, signal }),
          timeout,
          `${tool.name} timed out after ${timeout / 1000} s. The page may be busy or showing a dialog; try again or take a screenshot.`,
          context.signal,
        )
      : await tool.execute(input, context);
  } catch (error) {
    context.signal?.throwIfAborted();
    const message = errorMessage(error);
    result = { text: message, details: { error: message }, isError: true };
  }
  // No await between reading and updating `sources`, so parallel calls never
  // assign the same id twice.
  const now = Date.now();
  const { sources: merged, added } = assignChatSources(
    sources.current,
    (result.sources || []).map((source) => ({
      ...source,
      id: "",
      createdAt: now,
    })),
  );
  sources.current = merged;
  const cite = added.length
    ? `\nCite as: ${added.map((source) => `[[cite:${source.id}]] ${source.title}`).join("; ")}`
    : "";
  return {
    text: `${result.text}${cite}`,
    output: {
      ...(result.details || {}),
      ...(result.isError && !result.details?.error
        ? { error: result.text }
        : {}),
      ...(added.length ? { _sources: added } : {}),
    },
    image: result.image,
    isError: !!result.isError,
  };
}
