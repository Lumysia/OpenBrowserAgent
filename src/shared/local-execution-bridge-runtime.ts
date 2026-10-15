import { sendRuntimeRequest } from "./runtime-messages";

export const LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE =
  "local-execution-bridge.request";

type LocalExecutionBridgeRuntimeRequest = {
  type: typeof LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE;
  operation: "test";
  bridgeId: string;
};

export function sendLocalExecutionBridgeRuntimeRequest<T>(
  request: Omit<LocalExecutionBridgeRuntimeRequest, "type">,
) {
  return sendRuntimeRequest<T>(
    { type: LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE, ...request },
    "Local execution bridge",
  );
}
