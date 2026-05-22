import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import type { Messages } from "../../src/shared/i18n";
import { CHAT_PART_STATE } from "../../src/shared/types";
import { localizedAgentTitle } from "../../src/ui/agent-display";

export function subAgentTitle(
  base: string | undefined,
  output: Record<string, unknown>,
  toolText: { running?: string; done?: string } | undefined,
  t: Messages,
) {
  if (output.state === "completed")
    return t.sidepanel.tool.getSubAgentStatus.done;
  if (output.state === "running") return toolText?.running || base;
  return base;
}

export function subAgentDetail(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  t: Messages,
  fallback: string | undefined,
) {
  return (
    compactJoin([
      subAgentStateLabel(output, t),
      localizedSubAgentTitle(input, output, t),
    ]) ||
    fallback ||
    t.sidepanel.tool.startSubAgent.running
  );
}

export function subAgentProgressDetail(
  name: string,
  output: Record<string, unknown>,
  t: Messages,
  toolLabel: (name: string, t: Messages) => string,
) {
  if (
    name !== BROWSER_TOOL_NAME.startSubAgent &&
    name !== BROWSER_TOOL_NAME.getSubAgentStatus
  )
    return "";
  if (output.state !== "running") return "";
  const progress = Array.isArray(output.progress) ? output.progress : [];
  const current = [...progress]
    .reverse()
    .find(
      (item) =>
        item &&
        typeof item === "object" &&
        String((item as Record<string, unknown>).state) !==
          CHAT_PART_STATE.outputAvailable &&
        String((item as Record<string, unknown>).state) !==
          CHAT_PART_STATE.outputError,
    ) as Record<string, unknown> | undefined;
  const toolName = stringValue(current?.toolName);
  if (!toolName) return "";
  return compactJoin([toolLabel(toolName, t), stringValue(current?.title)]);
}

function subAgentStateLabel(output: Record<string, unknown>, t: Messages) {
  const state = stringValue(output.state);
  if (state === "completed") return t.sidepanel.subAgentCompleted;
  if (state === "running") return t.sidepanel.subAgentRunning;
  if (state === "missing") return t.sidepanel.subAgentMissing;
  return state;
}

function localizedSubAgentTitle(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  t: Messages,
) {
  return localizedAgentTitle({
    title: stringValue(output.title) || stringValue(input.title),
    agentId: stringValue(output.agentId) || stringValue(input.agentId),
    agentName: stringValue(output.agentName) || stringValue(input.agentName),
    fallback: stringValue(input.taskId) || stringValue(input.task),
    t,
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function compactJoin(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" · ");
}
