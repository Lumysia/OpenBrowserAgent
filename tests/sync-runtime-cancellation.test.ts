import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import "../src/shared/sync-backends-impl";
import {
  handleSyncBackendRuntimePort,
  readWebDavObject,
  writeWebDavObject,
} from "../src/shared/sync-backends";
import { installBrowser } from "./helpers";
import { deferred, eventListeners } from "./tool-fixtures";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
afterEach(() => {
  mock.restoreAll();
  if (originalDocument)
    Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

function foreground() {
  installBrowser();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {},
  });
  const connections: ReturnType<typeof portPair>[] = [];
  Object.assign(chrome, {
    runtime: {
      connect({ name }: { name: string }) {
        const pair = portPair(name);
        connections.push(pair);
        assert.equal(
          handleSyncBackendRuntimePort(
            pair.background as unknown as chrome.runtime.Port,
          ),
          true,
        );
        return pair.frontend;
      },
    },
  });
  const started = deferred();
  const aborted = deferred();
  const methods: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    methods.push(init.method!);
    if (url.endsWith("sibling"))
      return new Response(new Uint8Array([1, 2, 255]));
    if (url.endsWith("error"))
      return new Response("fixture failure", { status: 503 });
    started.resolve();
    return new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener(
        "abort",
        () => {
          aborted.resolve();
          reject(init.signal!.reason);
        },
        { once: true },
      );
    });
  });
  return { connections, started, aborted, methods };
}

function portPair(name: string) {
  let closed = false;
  const endpoint = () => ({
    name,
    onMessage: eventListeners(),
    onDisconnect: eventListeners(),
    postMessage: (_message: unknown) => {},
    disconnect: () => {},
  });
  const frontend = endpoint();
  const background = endpoint();
  frontend.postMessage = (message) =>
    queueMicrotask(() => {
      if (!closed) background.onMessage.emit(structuredClone(message));
    });
  background.postMessage = (message) =>
    queueMicrotask(() => frontend.onMessage.emit(structuredClone(message)));
  frontend.disconnect = background.disconnect = () => {
    if (closed) return;
    closed = true;
    queueMicrotask(() => {
      frontend.onDisconnect.emit();
      background.onDisconnect.emit();
    });
  };
  return { frontend, background };
}

const backend = {
  id: "fixture",
  name: "Fixture",
  type: "webdav" as const,
  url: "https://example.test/",
};

test("foreground WebDAV read cancellation aborts its background fetch without canceling a sibling", async () => {
  const { connections, started, aborted } = foreground();
  const controller = new AbortController();
  const reading = readWebDavObject(backend, "held", controller.signal);
  await started.promise;
  const sibling = readWebDavObject(
    backend,
    "sibling",
    new AbortController().signal,
  );
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  await aborted.promise;
  assert.deepEqual(await sibling, new Uint8Array([1, 2, 255]));
  await new Promise((resolve) => setImmediate(resolve));
  for (const { frontend, background } of connections) {
    assert.equal(
      frontend.onMessage.listeners.size +
        frontend.onDisconnect.listeners.size +
        background.onMessage.listeners.size +
        background.onDisconnect.listeners.size,
      0,
    );
  }
});

test("foreground upload abort during collection creation cannot issue a later PUT; pre-abort cannot connect", async () => {
  const { connections, started, aborted, methods } = foreground();
  const controller = new AbortController();
  const uploading = writeWebDavObject(
    backend,
    "attachments/image",
    new Uint8Array([7]),
    "image/png",
    controller.signal,
  );
  await started.promise;
  controller.abort();
  await assert.rejects(uploading, { name: "AbortError" });
  await aborted.promise;
  await assert.rejects(readWebDavObject(backend, "unused", controller.signal), {
    name: "AbortError",
  });
  assert.deepEqual(methods, ["MKCOL"]);
  assert.equal(connections.length, 1);
});

test("foreground request fails on disconnect and preserves backend errors", async () => {
  const { connections, started, aborted } = foreground();
  await assert.rejects(
    readWebDavObject(backend, "error", new AbortController().signal),
    /WebDAV read failed: 503/,
  );
  const reading = readWebDavObject(
    backend,
    "held",
    new AbortController().signal,
  );
  await started.promise;
  connections.at(-1)!.background.disconnect();
  await assert.rejects(reading, /disconnected before responding/);
  await aborted.promise;
});
