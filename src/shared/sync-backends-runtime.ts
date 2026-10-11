import { base64ToBytes, bytesToBase64 } from "./binary";
import {
  createSyncBackend,
  readSyncBackendObject,
  removeSyncBackendObject,
  SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
  SYNC_BACKEND_RUNTIME_PORT_NAME,
  writeSyncBackendObject,
  type SyncBackendRuntimeRequest,
  type SyncBackendRuntimeResponse,
} from "./sync-backends";

// Background side of the sync backend protocol: extension pages reach the
// backends through these handlers.

export function handleSyncBackendRuntimeMessage(
  message: unknown,
  sendResponse: (response: SyncBackendRuntimeResponse) => void,
) {
  if (!isSyncBackendRuntimeRequest(message)) return false;
  runSyncBackendOperation(message)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}

export function handleSyncBackendRuntimePort(port: chrome.runtime.Port) {
  if (port.name !== SYNC_BACKEND_RUNTIME_PORT_NAME) return false;
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  const receive = (message: unknown) => {
    port.onMessage.removeListener(receive);
    const operation = isSyncBackendRuntimeRequest(message)
      ? runSyncBackendOperation(message, controller.signal)
      : Promise.reject(new Error("Invalid sync backend request."));
    operation
      .then(
        (value) => ({ ok: true, value }) as const,
        (error) =>
          ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }) as const,
      )
      .then((response) => {
        if (!controller.signal.aborted) port.postMessage(response);
      })
      .catch(() => undefined)
      .finally(() => {
        port.onDisconnect.removeListener(disconnect);
        port.disconnect();
      });
  };
  port.onDisconnect.addListener(disconnect);
  port.onMessage.addListener(receive);
  return true;
}

async function runSyncBackendOperation(
  request: SyncBackendRuntimeRequest,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const backend = createSyncBackend(request.backendConfig);
  if (request.operation === "test") return backend.test();
  if (request.operation === "webDavReadObject") {
    if (!request.objectName) throw new Error("WebDAV object name is required.");
    const bytes = await readSyncBackendObject(
      backend,
      request.objectName,
      signal,
    );
    return bytes ? bytesToBase64(bytes) : undefined;
  }
  if (request.operation === "webDavWriteObject") {
    if (!request.objectName || typeof request.value !== "string")
      throw new Error("WebDAV object payload is required.");
    await writeSyncBackendObject(
      backend,
      request.objectName,
      base64ToBytes(request.value),
      request.contentType || "application/octet-stream",
      signal,
    );
    return undefined;
  }
  if (request.operation === "webDavRemoveObject") {
    if (!request.objectName) throw new Error("WebDAV object name is required.");
    await removeSyncBackendObject(backend, request.objectName);
    return undefined;
  }
  if (!request.key) throw new Error("Sync backend request key is required.");
  if (request.operation === "read") return backend.read(request.key);
  if (request.operation === "write")
    return backend.write(request.key, request.value);
  if (request.operation === "writeItems")
    return backend.writeItems(
      request.key,
      request.value,
      request.contents || {},
    );
  if (request.operation === "readItem") {
    if (!request.itemId) throw new Error("Sync item id is required.");
    return backend.readItem(request.key, request.itemId, !!request.have);
  }
  if (request.operation === "remove") return backend.remove(request.key);
  throw new Error(`Unknown sync backend operation: ${request.operation}`);
}

function isSyncBackendRuntimeRequest(
  message: unknown,
): message is SyncBackendRuntimeRequest {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === SYNC_BACKEND_RUNTIME_MESSAGE_TYPE
  );
}
