import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { DEFAULT_AGENT } from "../src/shared/agents";
import { storage } from "../src/shared/storage";
import { runPiAgent } from "../src/background/pi-runtime";
import * as sessions from "../src/background/stream-sessions";
import { runSubAgentChat } from "../src/background/sub-agent-run";
import { installPiRuntimeBrowser, setupPiRuntime } from "./pi-runtime-helpers";
import { providerFixture, reply } from "./provider-fixtures";

installPiRuntimeBrowser();

async function childFixture() {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "child answer" }),
  );
  mock.method(storage.provider, "get", async () => ({
    fx: {
      type: "openai",
      apiKey: "",
      baseUrl: `${fixture.baseUrl}/v1`,
      models: [{ id: "fixture", name: "fixture" }],
    },
  }));
  return fixture;
}

test("a parent stopped while the sub-agent chat is created stops the child", async () => {
  const fixture = await childFixture();
  const parent = new AbortController();
  try {
    const result = await runSubAgentChat({
      agent: { ...DEFAULT_AGENT, toolGroups: [] },
      task: "do something",
      title: "t",
      parent: { chatId: "parent", toolCallId: "call" },
      onStart: () => parent.abort(),
      onProgress: () => {},
      signal: parent.signal,
    });
    sessions.abortSession(result.chatId);
    assert.equal(fixture.requests.length, 0);
    assert.equal(result.error, "The run was stopped.");
  } finally {
    await fixture.close();
  }
});

test("a sub-agent reports its usage for the parent's run", async () => {
  const fixture = await childFixture();
  try {
    const result = await runSubAgentChat({
      agent: { ...DEFAULT_AGENT, toolGroups: [] },
      task: "do something",
      title: "t",
      parent: { chatId: "parent", toolCallId: "call" },
      onStart: () => {},
      onProgress: () => {},
    });
    sessions.abortSession(result.chatId);
    assert.equal(result.answer, "child answer");
    assert.equal(result.usage?.modelCalls, 1);
    assert.ok(result.usage?.usage?.inputTokens);
  } finally {
    await fixture.close();
  }
});

test("a sub-agent reads a stored output its parent passed on", async () => {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      requests.length === 1
        ? {
            calls: [
              { id: "r", name: "read", args: { source: "art-12345678" } },
            ],
          }
        : { text: "ok" },
    ),
  );
  const run = setupPiRuntime(fixture.baseUrl);
  await run.options.artifacts!.put({
    chatId: "parent-chat",
    handle: "art-12345678",
    label: "snapshot",
    text: "PARENT-FINDINGS",
    createdAt: 1,
  });
  run.options.setup.parentChatId = "parent-chat";
  try {
    await runPiAgent(run.options);
    assert.match(
      JSON.stringify(fixture.requests.at(-1)?.body),
      /PARENT-FINDINGS/,
    );
  } finally {
    run.close();
    await fixture.close();
  }
});
