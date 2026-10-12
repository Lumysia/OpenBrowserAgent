import type { Messages } from "../../src/shared/i18n";
import { CHAT_PART_STATE } from "../../src/shared/types";
import { toolLabel } from "./tool-part-detail";

// The tool a running sub-agent is using right now.
export function subAgentProgressDetail(
  output: Record<string, unknown>,
  t: Messages,
) {
  if (output.state !== "running" || !Array.isArray(output.progress)) return "";
  const current = [...output.progress]
    .reverse()
    .find(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as { state?: string }).state !==
          CHAT_PART_STATE.outputAvailable &&
        (item as { state?: string }).state !== CHAT_PART_STATE.outputError,
    ) as { toolName?: string } | undefined;
  return current?.toolName ? toolLabel(current.toolName, t, false) : "";
}
