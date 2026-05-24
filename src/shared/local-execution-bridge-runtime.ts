export const LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE =
  "local-execution-bridge.request";

export type LocalExecutionBridgeRuntimeRequest = {
  type: typeof LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE;
  operation: "test";
  bridgeId: string;
};

export type LocalExecutionBridgeRuntimeResponse<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

export async function sendLocalExecutionBridgeRuntimeRequest<T>(
  request: Omit<LocalExecutionBridgeRuntimeRequest, "type">,
) {
  const response = (await chrome.runtime.sendMessage({
    type: LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE,
    ...request,
  })) as LocalExecutionBridgeRuntimeResponse<T> | undefined;
  if (!response) throw new Error("Local execution bridge did not respond.");
  if (!response.ok) throw new Error(response.error);
  return response.value as T;
}
