import { mock } from "node:test";

export function browserStorage() {
  const data: Record<string, unknown> = {};
  const writes: Array<{ keys: string[]; bytes: number }> = [];
  const area = {
    async get(key: string | null) {
      return structuredClone(key === null ? data : { [key]: data[key] });
    },
    async set(value: Record<string, unknown>) {
      writes.push({
        keys: Object.keys(value),
        bytes: JSON.stringify(value).length,
      });
      Object.assign(data, structuredClone(value));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  return { data, writes, area };
}

// Hold one matching I/O boundary. `after` captures a stale result before an edit;
// the default holds before the operation, so no effect has occurred on entry.
export function holdMethod<T extends object, K extends keyof T>(
  object: T,
  method: K,
  matches: (...args: any[]) => boolean,
  after = false,
) {
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const original = (object[method] as (...args: any[]) => unknown).bind(object);
  let held = false;
  mock.method(object, method as never, async (...args: any[]) => {
    if (held || !matches(...args)) return original(...args);
    held = true;
    const result = after ? await original(...args) : undefined;
    entered.resolve();
    await released.promise;
    return after ? result : original(...args);
  });
  return { started: entered.promise, release: released.resolve };
}

export function installBrowser(
  local = browserStorage(),
  sync = browserStorage(),
) {
  Object.assign(globalThis, {
    chrome: {
      storage: { local: local.area, sync: sync.area },
    },
  });
  return { local, sync };
}

export function chatHistory(count: number, messages = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: `chat-${index}`,
    title: `Conversation ${index}`,
    createdAt: index,
    updatedAt: index,
    messages: Array.from({ length: messages }, (_, message) => ({
      id: `message-${message}`,
      role: message % 2 ? "assistant" : "user",
      content: `Message ${message}: ${"browser history ".repeat(64)}`,
      createdAt: message,
      parts: [
        { id: `part-${message}`, type: "text", text: "A streamed answer" },
      ],
      metadata: {
        runMetrics: { startedAt: 1, endedAt: 2, streamEventIndex: 10 },
      },
    })),
    sources: [
      { id: "source", url: "https://example.org/", title: "Reference" },
    ],
  }));
}
