import { sendRuntimeRequest } from "./runtime-messages";

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

export function describeRun(agentId: string) {
  return sendRuntimeRequest<RunDescription>(
    { type: DESCRIBE_RUN, agentId },
    "Run description",
  );
}
