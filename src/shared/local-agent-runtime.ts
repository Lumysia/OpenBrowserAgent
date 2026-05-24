export const LOCAL_AGENT_RUNTIME_MESSAGE_TYPE = "local-agent.request";

export type LocalAgentRuntimeRequest = {
  type: typeof LOCAL_AGENT_RUNTIME_MESSAGE_TYPE;
  operation: "test";
  agentId: string;
};

export type LocalAgentRuntimeResponse<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

export async function sendLocalAgentRuntimeRequest<T>(
  request: Omit<LocalAgentRuntimeRequest, "type">,
) {
  const response = (await chrome.runtime.sendMessage({
    type: LOCAL_AGENT_RUNTIME_MESSAGE_TYPE,
    ...request,
  })) as LocalAgentRuntimeResponse<T> | undefined;
  if (!response) throw new Error("Local execution bridge did not respond.");
  if (!response.ok) throw new Error(response.error);
  return response.value as T;
}
