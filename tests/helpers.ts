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
    async remove(key: string) {
      delete data[key];
    },
  };
  return { data, writes, area };
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
