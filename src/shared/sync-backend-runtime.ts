import { getBrowserApi } from "./browser-api";
import type { SyncBackendConfig } from "./types";

export const SYNC_BACKEND_RUNTIME_MESSAGE_TYPE = "sync-backend.request";
export const SYNC_BACKEND_RUNTIME_PORT_NAME = "sync-backend.operation";

export type SyncBackendRuntimeRequest = {
  type: typeof SYNC_BACKEND_RUNTIME_MESSAGE_TYPE;
  backendConfig: SyncBackendConfig;
  operation:
    | "read"
    | "write"
    | "remove"
    | "test"
    | "decodeChange"
    | "webDavReadObject"
    | "webDavWriteObject"
    | "webDavRemoveObject";
  key?: string;
  objectName?: string;
  contentType?: string;
  value?: unknown;
  cachedValue?: unknown;
};

export type SyncBackendRuntimeResponse<T = unknown> =
  { ok: true; value?: T } | { ok: false; error: string };

export async function sendSyncBackendRequest<T>(
  request: SyncBackendRuntimeRequest,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const response = signal
    ? await requestWithSignal<T>(request, signal)
    : ((await getBrowserApi().runtime.sendMessage(request)) as
        SyncBackendRuntimeResponse<T> | undefined);
  if (!response) throw new Error("Sync backend did not return a response.");
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

// One operation per port makes cancellation ownership explicit. Closing a page
// or aborting its caller closes the port and aborts the background fetch too.
function requestWithSignal<T>(
  request: SyncBackendRuntimeRequest,
  signal: AbortSignal,
) {
  return new Promise<SyncBackendRuntimeResponse<T>>((resolve, reject) => {
    const runtime = getBrowserApi().runtime;
    const port = runtime.connect({ name: SYNC_BACKEND_RUNTIME_PORT_NAME });
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      port.onMessage.removeListener(receive);
      port.onDisconnect.removeListener(disconnect);
      port.disconnect();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const receive = (response: SyncBackendRuntimeResponse<T>) => {
      cleanup();
      resolve(response);
    };
    const disconnect = () => {
      const error = runtime.lastError;
      cleanup();
      reject(
        new Error(
          error?.message || "Sync backend disconnected before responding.",
        ),
      );
    };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnect);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      port.postMessage(request);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
