import { createServer } from "node:http";
import { once } from "node:events";
import { launchExtension, poll } from "./chromium.mjs";

// Runs the production extension's Pi loop against an entirely local provider.
// Tests supply tool calls, never import/inject a replacement tool implementation.
export async function browserToolFixture(handleRequest) {
  let steps = [];
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
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    const step = steps[calls++];
    const delta = step
      ? {
          tool_calls: [
            {
              index: 0,
              id: `tool-${calls}`,
              type: "function",
              function: {
                name: step.name,
                arguments: JSON.stringify(step.args),
              },
            },
          ],
        }
      : { content: "Fixture complete." };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [value, finish] of [
      [delta, null],
      [{}, step ? "tool_calls" : "stop"],
    ])
      response.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: value, finish_reason: finish }] })}\n\n`,
      );
    response.end("data: [DONE]\n\n");
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
    const page = await browser.open(
      `chrome-extension://${browser.id}/sidepanel.html`,
    );
    await page.call(async (baseUrl) => {
      await chrome.storage.local.set({
        provider: {
          fixture: {
            id: "fixture",
            type: "openai",
            baseUrl: `${baseUrl}/v1`,
            models: [{ id: "fixture", name: "fixture", supportsImages: true }],
            imageModels: [{ id: "fixture-image", name: "fixture-image" }],
          },
        },
        preferences: {
          imageGenerationEnabled: true,
          selectedImageModelId: "fixture-image",
        },
      });
    }, baseUrl);
    const start = async (
      toolSteps,
      uploadedAttachments = [],
      capabilities = {},
    ) => {
      steps = toolSteps;
      calls = 0;
      requests.length = 0;
      await page.call(
        ({ maxToolSteps, uploadedAttachments, capabilities }) => {
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
              context: { uploadedAttachments },
              modelId: "fixture",
              maxToolSteps,
              agentCapabilities: {
                browserTools: true,
                browserAutomation: true,
                deferredBrowserTools: true,
                cdpTools: true,
                javascriptExecution: true,
                fileUrlRead: true,
                imageGeneration: true,
                localExecutionBridges: true,
                ...capabilities,
              },
            },
          });
        },
        {
          maxToolSteps: toolSteps.length + 1,
          uploadedAttachments,
          capabilities,
        },
      );
    };
    return {
      browser,
      page,
      baseUrl,
      requests,
      start,
      async run(steps, capabilities) {
        await start(steps, [], capabilities);
        await poll(() => page.call(() => toolRun.done), 60000);
        return page.call(() =>
          toolRun.events
            .filter((event) => event.chunk?.output)
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
