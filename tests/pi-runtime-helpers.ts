import type { Artifact, ArtifactStore } from "../src/shared/artifacts";
import { afterEach, beforeEach, mock } from "node:test";
import type { ServerResponse } from "node:http";
import type { ProviderId } from "../src/shared/providers";
import { DEFAULT_AGENT } from "../src/shared/agents";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { storage } from "../src/shared/storage";
import { runPiAgent } from "../src/background/pi-runtime";
import { createRunTab } from "../src/background/run-tab";
import * as sessions from "../src/background/stream-sessions";
import { fakeTabs, installChrome } from "./fake-chrome";

export function installPiRuntimeBrowser() {
  beforeEach(() => {
    installChrome({
      tabs: fakeTabs([{ id: 42, title: "Fixture tab" }]).api,
    });
    mock.method(storage.preferences, "get", async () => DEFAULT_PREFERENCES);
  });
  afterEach(() => mock.restoreAll());
}

export function setupPiRuntime(
  baseUrl: string,
  provider: ProviderId = "openai",
) {
  const chatId = crypto.randomUUID();
  const session = sessions.createStreamSession(chatId);
  const model = {
    provider,
    baseUrl: `${baseUrl}${provider === "ollama" ? "" : provider === "gemini" ? "/v1beta" : "/v1"}`,
    modelName: "fixture",
    apiKey: "",
  };
  const options: Parameters<typeof runPiAgent>[0] = {
    session,
    model,
    helperModel: model,
    artifacts: memoryArtifacts(),
    system: "Assist with browsing",
    messages: [{ id: "user", role: "user", content: "Help", createdAt: 1 }],
    setup: {
      agent: { ...DEFAULT_AGENT, toolGroups: [...DEFAULT_AGENT.toolGroups] },
      skills: [],
      attachments: [],
      mcpServers: [],
      preferences: DEFAULT_PREFERENCES,
      depth: 0,
      tab: createRunTab(chatId, { id: 42, title: "Fixture tab" }),
    },
    maxToolSteps: 3,
    messageId: "answer",
  };
  return { session, options, close: () => sessions.abortSession(chatId) };
}

export function chatDelta(
  response: ServerResponse,
  delta: object,
  finishReason: string | null = null,
) {
  response.write(
    `data: ${JSON.stringify({
      id: "fixture",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    })}\n\n`,
  );
}

export function toolDelta(
  response: ServerResponse,
  args: string,
  start = false,
) {
  chatDelta(response, {
    tool_calls: [
      {
        index: 0,
        ...(start ? { id: "close", type: "function" } : {}),
        function: { ...(start ? { name: "tabs" } : {}), arguments: args },
      },
    ],
  });
}

export function memoryArtifacts(): ArtifactStore {
  const items = new Map<string, Artifact>();
  return {
    async put(artifact) {
      items.set(`${artifact.chatId}/${artifact.handle}`, artifact);
    },
    async get(chatId, handle) {
      return items.get(`${chatId}/${handle}`);
    },
  };
}
