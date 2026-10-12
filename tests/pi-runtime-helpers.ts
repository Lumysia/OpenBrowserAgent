import type { Artifact, ArtifactStore } from "../src/shared/artifacts";
import { afterEach, beforeEach, mock } from "node:test";
import type { ServerResponse } from "node:http";
import type { AgentCapabilities, ProviderId } from "../src/shared/types";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { storage } from "../src/shared/storage";
import { runPiAgent } from "../src/background/pi-runtime";
import * as sessions from "../src/background/stream-sessions";
import { installBrowser } from "./helpers";

export function installPiRuntimeBrowser() {
  beforeEach(() => {
    installBrowser();
    Object.assign(chrome.storage, {
      onChanged: { addListener() {}, removeListener() {} },
    });
    Object.assign(chrome, {
      tabs: {
        query: async () => [{ id: 42, title: "Fixture tab", active: true }],
      },
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
    capabilities: {
      browserTools: true,
      browserAutomation: true,
    } as AgentCapabilities,
    maxToolSteps: 3,
    messageId: "answer",
    uploadedAttachments: [],
    availableSkills: [],
    mcpServers: [],
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
        function: { ...(start ? { name: "manageTabs" } : {}), arguments: args },
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
