import { storage } from "../shared/storage";
import { normalizeLocalExecutionBridges } from "../shared/local-execution-bridges";

export type BridgePing = {
  success: true;
  shell?: string;
  shellArgsPreview?: string[];
  platform?: string;
  cwd?: string;
  node?: string;
  env?: Record<string, unknown>;
  localCli?: Record<string, unknown>[];
};

export async function testLocalExecutionBridge(
  bridgeId: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bridge = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  ).find((item) => item.id === bridgeId);
  signal?.throwIfAborted();
  if (!bridge) throw new Error("Local execution bridge not found.");
  if (!bridge.hostName) throw new Error("Native host name is required.");
  const port = chrome.runtime.connectNative(bridge.hostName);
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
    const disconnect = () =>
      fail(new Error(chrome.runtime.lastError?.message || "Disconnected."));
    const receive = (value: unknown) => {
      const message = object(value);
      if (["command.error", "error"].includes(String(message.type))) {
        fail(new Error(String(message.error || "Bridge test failed.")));
        return;
      }
      if (!["command.pong", "pong"].includes(String(message.type))) return;
      cleanup();
      resolve({
        success: true,
        shell: text(message.shell),
        shellArgsPreview: Array.isArray(message.shellArgsPreview)
          ? message.shellArgsPreview.map(String)
          : undefined,
        platform: text(message.platform),
        cwd: text(message.cwd),
        node: text(message.node),
        env: object(message.env),
        localCli: Array.isArray(message.localCli)
          ? message.localCli.map(object)
          : undefined,
      });
    };
    const timer = setTimeout(
      () => fail(new Error("Local execution bridge test timed out.")),
      5000,
    );
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnect);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      port.postMessage({
        type: "command.ping",
        command: {
          id: bridge.id,
          key: bridge.bridgeKey || bridge.id,
          name: bridge.name,
          hostAddress: bridge.hostAddress || "",
          secret: bridge.secret || "",
        },
      });
    } catch (error) {
      fail(error);
    }
  });
}

export async function markLocalExecutionBridgeTested(
  bridgeId: string,
  error: string,
  signal?: AbortSignal,
) {
  const bridges = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  );
  signal?.throwIfAborted();
  const now = Date.now();
  await storage.localExecutionBridges.set(
    bridges.map((bridge) =>
      bridge.id === bridgeId
        ? {
            ...bridge,
            lastTestedAt: error ? undefined : now,
            lastTestError: error,
            updatedAt: now,
          }
        : bridge,
    ),
  );
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
