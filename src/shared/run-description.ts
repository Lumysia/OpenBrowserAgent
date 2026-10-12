import { getBrowserApi } from "./browser-api";

// The system prompt and tools a run of an agent starts with, computed by the
// background (which owns the run setup). Used by chat export.
export const DESCRIBE_RUN = "describeRun";

type ToolSchema = {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: { required?: string[] };
  };
};

export type RunDescription = {
  system: string;
  // Declared from the first request.
  tools: ToolSchema[];
  // Declared once toolSearch loads them.
  onDemandTools: ToolSchema[];
};

export async function describeRun(agentId: string) {
  const response = (await getBrowserApi().runtime.sendMessage({
    type: DESCRIBE_RUN,
    agentId,
  })) as { ok: boolean; value?: RunDescription; error?: string };
  if (!response?.ok) throw new Error(response?.error || "No run description.");
  return response.value!;
}
