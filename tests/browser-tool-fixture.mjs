import assert from "node:assert/strict";
import { TOOL_GROUPS } from "../src/shared/agents.ts";
import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
} from "../src/shared/types.ts";
import { fixtureProvider, startExtension } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import { reply } from "./provider-fixtures.ts";

// The ref written right after `label` in a snapshot line.
export const ref = (text, label) => {
  const line = text.split("\n").find((item) => item.includes(label));
  assert.ok(line, `no line with ${label} in:\n${text}`);
  return line.slice(line.indexOf(label)).match(/\b(e\d+)\b/)?.[1];
};

// Runs the production extension's Pi loop against an entirely local provider.
// Tests supply tool calls, never import/inject a replacement tool implementation.
// `respond(body, index)` may replace the step list to route by request content.
// `handleRequest(request, response)` serves other paths (true when it did).
// `launch` holds extra launchExtension options, such as browser preferences.
export async function browserToolFixture(handleRequest, launch = {}) {
  let steps = [];
  let respond;
  let calls = 0;
  // The model requests' bodies.
  const requests = [];
  const session = await startExtension({
    handle: async (request, response) => {
      if (request.url !== "/v1/chat/completions") {
        if (await handleRequest?.(request, response)) return;
        response.writeHead(404).end();
        return;
      }
      requests.push(request.body);
      if (respond)
        return reply(response, "openai", respond(request.body, calls++));
      const step = steps[calls++];
      reply(
        response,
        "openai",
        step
          ? {
              calls: [
                { id: `tool-${calls}`, name: step.name, args: step.args },
              ],
            }
          : { text: "Fixture complete." },
      );
    },
    storage: (baseUrl) => ({
      provider: {
        fixture: fixtureProvider(baseUrl, {
          models: [{ id: "fixture", name: "fixture", supportsImages: true }],
          imageModels: [{ id: "fixture-image", name: "fixture-image" }],
        }),
      },
      preferences: {
        selectedImageModelId: "fixture-image",
        maxToolSteps: 40,
      },
      agents: [
        {
          id: "fixture-agent",
          name: "Fixture",
          prompt: "",
          toolGroups: [...TOOL_GROUPS],
          workspace: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
    launch,
  });
  const { browser, fixture, close } = session;
  const baseUrl = fixture.baseUrl;
  // Runs start from the options page: no side panel is open.
  const page = session.options;
  try {
    await browser.browser.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: browser.profile,
    });
    // Sets what the model answers, for runs started here or in the side
    // panel.
    const script = (toolSteps) => {
      if (typeof toolSteps === "function") {
        respond = toolSteps;
        steps = [];
      } else {
        respond = undefined;
        steps = toolSteps;
      }
      calls = 0;
      requests.length = 0;
    };
    const start = async (toolSteps, uploadedAttachments = []) => {
      script(toolSteps);
      await page.call(
        ({ uploadedAttachments, portName, sendMessages }) => {
          const chatId = crypto.randomUUID();
          const port = chrome.runtime.connect({ name: portName });
          const run = { chatId, events: [], done: false, port };
          globalThis.toolRun = run;
          port.onMessage.addListener((event) => {
            run.events.push(event);
            if (event.type === "end" || event.type === "error") {
              run.done = true;
              port.disconnect();
            }
          });
          port.postMessage({
            type: sendMessages,
            chatId,
            messageId: "answer",
            messages: [
              {
                id: "user",
                role: "user",
                content: "Run the local fixture tools",
                createdAt: Date.now(),
              },
            ],
            body: {
              agentId: "fixture-agent",
              modelId: "fixture",
              uploadedAttachments,
            },
          });
        },
        {
          uploadedAttachments,
          portName: AI_STREAM_PORT_NAME,
          sendMessages: AI_STREAM_REQUEST_TYPE.sendMessages,
        },
      );
    };
    // The text the model read for each tool call, in call order.
    const toolTexts = () =>
      (requests.at(-1)?.messages || [])
        .filter((message) => message.role === "tool")
        .map((message) =>
          typeof message.content === "string"
            ? message.content
            : message.content.map((part) => part.text || "").join(""),
        );
    // Opens a fixture page in a new active tab and waits for it to load.
    const open = async (path) => {
      const tab = await page.call(
        (url) => chrome.tabs.create({ url, active: true }),
        `${baseUrl}${path}`,
      );
      await poll(() =>
        page.call(
          async (id) => (await chrome.tabs.get(id)).status === "complete",
          tab.id,
        ),
      );
      return tab.id;
    };
    // Evaluates code in a tab's own JavaScript world.
    const evaluate = (tabId, code) =>
      page.call(
        async ({ tabId, code }) =>
          (
            await chrome.scripting.executeScript({
              target: { tabId },
              world: "MAIN",
              func: (source) => (0, eval)(source),
              args: [code],
            })
          )[0].result,
        { tabId, code },
      );
    return {
      browser,
      page,
      baseUrl,
      open,
      evaluate,
      requests,
      script,
      start,
      toolTexts,
      async run(steps) {
        await start(steps);
        await poll(() => page.call(() => toolRun.done), 90000);
        return toolTexts();
      },
      // Side panel outputs of finished tool parts.
      outputs() {
        return page.call(() =>
          toolRun.events
            .filter(
              (event) =>
                event.chunk?.output &&
                ["output-available", "output-error"].includes(
                  event.chunk.state,
                ),
            )
            .map((event) => ({
              name: event.chunk.toolName,
              output: event.chunk.output,
            })),
        );
      },
      async abort() {
        await page.call((type) => {
          toolRun.port.postMessage({ type });
        }, AI_STREAM_REQUEST_TYPE.abort);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
