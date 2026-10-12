import { createServer } from "node:http";
import { once } from "node:events";
import { launchExtension, poll } from "./chromium.mjs";
import { reply } from "./provider-fixtures.mjs";

const ALL_GROUPS = [
  "pages",
  "browser",
  "web",
  "images",
  "skills",
  "workspace",
  "history",
  "subAgents",
  "mcp",
  "localExecution",
  "scripts",
  "devtools",
];

// Runs the production extension's Pi loop against an entirely local provider.
// Tests supply tool calls, never import/inject a replacement tool implementation.
// `respond(body, index)` may replace the step list to route by request content.
export async function browserToolFixture(handleRequest) {
  let steps = [];
  let respond;
  let calls = 0;
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions") {
      if (await handleRequest?.(request, response)) return;
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    if (respond) return reply(response, "openai", respond(body, calls++));
    const step = steps[calls++];
    reply(
      response,
      "openai",
      step
        ? { calls: [{ id: `tool-${calls}`, name: step.name, args: step.args }] }
        : { text: "Fixture complete." },
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await launchExtension({
      headed: process.env.OBA_HEADLESS !== "1",
    });
    await browser.browser.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: browser.profile,
    });
    // Runs start from the options page: no side panel is open.
    const page = await browser.open(
      `chrome-extension://${browser.id}/options.html`,
    );
    await page.call(
      async ({ baseUrl, groups }) => {
        await chrome.storage.local.set({
          provider: {
            fixture: {
              id: "fixture",
              type: "openai",
              baseUrl: `${baseUrl}/v1`,
              models: [
                { id: "fixture", name: "fixture", supportsImages: true },
              ],
              imageModels: [{ id: "fixture-image", name: "fixture-image" }],
            },
          },
          preferences: {
            imageGenerationEnabled: true,
            selectedImageModelId: "fixture-image",
            maxToolSteps: 40,
          },
          agents: [
            {
              id: "fixture-agent",
              name: "Fixture",
              prompt: "",
              toolGroups: groups,
              workspace: false,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        });
      },
      { baseUrl, groups: ALL_GROUPS },
    );
    const start = async (toolSteps, uploadedAttachments = []) => {
      if (typeof toolSteps === "function") {
        respond = toolSteps;
        steps = [];
      } else {
        respond = undefined;
        steps = toolSteps;
      }
      calls = 0;
      requests.length = 0;
      await page.call(
        ({ uploadedAttachments }) => {
          const chatId = crypto.randomUUID();
          const port = chrome.runtime.connect({ name: "ai-stream" });
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
            type: "sendMessages",
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
        { uploadedAttachments },
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
    return {
      browser,
      page,
      baseUrl,
      requests,
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
        await page.call(() => {
          toolRun.port.postMessage({ type: "abort" });
        });
      },
      async close() {
        await browser.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  } catch (error) {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
}
