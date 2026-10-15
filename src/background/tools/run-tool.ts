import { TOOL_OUTPUT_SOURCES } from "../../shared/tool-results";
import { PAGE_TOOL_GROUPS } from "../../shared/agents";
import { assignChatSources } from "../../shared/chat-sources";
import { withCancellationTimeout, type Pause } from "../../shared/cancellation";
import { BROWSER_TOOL_TIMEOUT_MS } from "../../shared/config";
import type { ChatSource } from "../../shared/types";
import { errorMessage } from "../../shared/error-message";
import {
  type RunContext,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./types";

type ToolOutcome = {
  // What the model reads.
  text: string;
  // What the side panel stores and shows.
  output: Record<string, unknown>;
  image?: ToolResult["image"];
  isError: boolean;
  // Every source the call returned, with its id in the chat.
  sources: ChatSource[];
};

// The time limit covers waiting for the browser. Helper model requests have
// their own provider limits and the user can stop them, so their time is not
// counted, and their failures say where they came from.
function helperOutsideLimit(
  run: RunContext,
  pause: Pause,
): RunContext["askHelper"] {
  return (system, prompt, signal) =>
    pause(async () => {
      try {
        return await run.askHelper(system, prompt, signal);
      } catch (error) {
        signal?.throwIfAborted();
        throw new Error(
          `The helper model request failed: ${errorMessage(error)}`,
        );
      }
    });
}

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
    (tool.group && PAGE_TOOL_GROUPS.includes(tool.group)
      ? BROWSER_TOOL_TIMEOUT_MS
      : 0);
  try {
    result = timeout
      ? await withCancellationTimeout(
          (signal, pause) =>
            tool.execute(input, {
              ...context,
              signal,
              run: {
                ...context.run,
                askHelper: helperOutsideLimit(context.run, pause),
              },
            }),
          timeout,
          `${tool.name} timed out after ${timeout / 1000} s waiting for the browser. The page may be busy or showing a dialog; try again or take a screenshot.`,
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
  const {
    sources: merged,
    added,
    cited,
  } = assignChatSources(
    sources.current,
    (result.sources || []).map((source) => ({
      ...source,
      id: "",
      createdAt: now,
    })),
  );
  sources.current = merged;
  // Sources the chat already had keep their ids and are named again, so the
  // model need not remember them.
  const cite = cited.length
    ? `\nCite as: ${cited.map((source) => `[[cite:${source.id}]] ${source.title}`).join("; ")}`
    : "";
  return {
    text: `${result.text}${cite}`,
    output: {
      ...(result.details || {}),
      ...(result.isError && !result.details?.error
        ? { error: result.text }
        : {}),
      ...(added.length ? { [TOOL_OUTPUT_SOURCES]: added } : {}),
    },
    image: result.image,
    isError: !!result.isError,
    sources: cited,
  };
}
