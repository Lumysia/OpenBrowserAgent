import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { DEFAULT_AGENT } from "../src/shared/agents";
import { storage } from "../src/shared/storage";
import { runSubAgentChat } from "../src/background/sub-agent-run";
import { installPiRuntimeBrowser } from "./pi-runtime-helpers";
import { providerFixture, reply } from "./provider-fixtures.mjs";

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
    assert.equal(fixture.requests.length, 0);
    assert.equal(result.error, "The sub-agent was stopped.");
  } finally {
    await fixture.close();
  }
});
