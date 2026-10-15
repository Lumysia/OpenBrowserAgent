import { getBrowserApi } from "../shared/browser-api";
import { LOCAL_EXECUTION_BRIDGE_LIMITS } from "../shared/config";
import {
  BRIDGE_MESSAGE,
  bridgeCommand,
  type BridgeErrorCode,
} from "../shared/local-execution-bridge-protocol";
import { normalizeLocalExecutionBridges } from "../shared/local-execution-bridges";
import { storage } from "../shared/storage";
import { USER_ERROR_CODE, UserError } from "../shared/user-errors";
import { recordOf, trimmedString } from "../shared/values";

type BridgePing = {
  success: true;
  shell?: string;
  shellArgsPreview?: string[];
  platform?: string;
  cwd?: string;
  node?: string;
  env?: Record<string, unknown>;
  localCli?: Record<string, unknown>[];
};

// An error the bridge host reported, with its code when it sent one.
export class BridgeHostError extends Error {
  constructor(
    message: string,
    readonly code?: BridgeErrorCode,
  ) {
    super(message);
    this.name = "BridgeHostError";
  }
}

export async function testLocalExecutionBridge(
  bridgeId: string,
  signal?: AbortSignal,
) {
  const bridge = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  ).find((item) => item.id === bridgeId);
  signal?.throwIfAborted();
  if (!bridge)
    throw new UserError(
      USER_ERROR_CODE.bridgeNotFound,
      "Local execution bridge not found.",
    );
  if (!bridge.hostName)
    throw new UserError(
      USER_ERROR_CODE.bridgeHostRequired,
      "Native host name is required.",
    );
  const runtime = getBrowserApi().runtime;
  const port = runtime.connectNative(bridge.hostName);
  return new Promise<BridgePing>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      port.onMessage.removeListener(receive);
      port.onDisconnect.removeListener(disconnect);
      port.disconnect();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(signal?.reason);
    // The browser's own text, e.g. that the native host is not installed.
    const disconnect = () =>
      fail(new Error(runtime.lastError?.message || "Disconnected."));
    const receive = (value: unknown) => {
      const message = recordOf(value);
      if (message.type === BRIDGE_MESSAGE.error) {
        fail(bridgeHostError(message));
        return;
      }
      if (message.type !== BRIDGE_MESSAGE.pong) return;
      cleanup();
      resolve({
        success: true,
        shell: trimmedString(message.shell),
        shellArgsPreview: Array.isArray(message.shellArgsPreview)
          ? message.shellArgsPreview.map(String)
          : undefined,
        platform: trimmedString(message.platform),
        cwd: trimmedString(message.cwd),
        node: trimmedString(message.node),
        env: recordOf(message.env),
        localCli: Array.isArray(message.localCli)
          ? message.localCli.map(recordOf)
          : undefined,
      });
    };
    const timer = setTimeout(
      () =>
        fail(
          new UserError(
            USER_ERROR_CODE.bridgeTimeout,
            "Local execution bridge test timed out.",
          ),
        ),
      LOCAL_EXECUTION_BRIDGE_LIMITS.pingTimeoutMs,
    );
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnect);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      port.postMessage({
        type: BRIDGE_MESSAGE.ping,
        command: bridgeCommand(bridge),
      });
    } catch (error) {
      fail(error);
    }
  });
}

export function bridgeHostError(message: Record<string, unknown>) {
  return new BridgeHostError(
    trimmedString(message.error) || "The execution bridge reported an error.",
    (trimmedString(message.code) || undefined) as BridgeErrorCode | undefined,
  );
}
