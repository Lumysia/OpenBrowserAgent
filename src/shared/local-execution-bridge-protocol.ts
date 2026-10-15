import type { LocalExecutionBridgeConfig } from "./types";

// Native messaging between the extension and the bridge host
// (packages/local-execution-bridge/bin/bridge.mjs, which keeps its own copy
// of these values because it is installed as one file; a test checks they
// agree).
export const BRIDGE_MESSAGE = {
  ping: "command.ping",
  run: "command.run",
  cancel: "command.cancel",
  pong: "command.pong",
  error: "command.error",
  done: "command.done",
  stdout: "stdout",
  stderr: "stderr",
} as const;

// `code` on a command.error from the host.
export const BRIDGE_ERROR = {
  unknownShellConfig: "unknownShellConfig",
  badSecret: "badSecret",
  missingCommand: "missingCommand",
  timeout: "timeout",
  exitCode: "exitCode",
  spawnFailed: "spawnFailed",
  unknownMessage: "unknownMessage",
} as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR)[keyof typeof BRIDGE_ERROR];

// Which shell config on the host a request is for, and its secret.
export function bridgeCommand(
  bridge: Pick<
    LocalExecutionBridgeConfig,
    "id" | "name" | "bridgeKey" | "hostAddress" | "secret"
  >,
) {
  return {
    id: bridge.id,
    key: bridge.bridgeKey || bridge.id,
    name: bridge.name,
    hostAddress: bridge.hostAddress || "",
    secret: bridge.secret || "",
  };
}
