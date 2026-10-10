import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";
import { checkComposer } from "./browser-composer.mjs";

// Headed by default. Build first. Real acceptance uses OBA_REAL_MODEL=1,
// OBA_PROVIDER (default openai), OBA_MODEL, OBA_BASE_URL and optional OBA_API_KEY.
// Pass secrets through the environment, never command-line literals or repo files.
const live = process.env.OBA_REAL_MODEL === "1";
const headed = process.env.OBA_HEADLESS !== "1";
if (live && (!process.env.OBA_MODEL || !process.env.OBA_BASE_URL))
  throw new Error("Real acceptance requires OBA_MODEL and OBA_BASE_URL");
let cancelConnectionsClosed = 0;
const fixture = live
  ? undefined
  : await providerFixture(async (request, response) => {
      const text = JSON.stringify(request.body);
      if (text.includes("OBA_CANCEL")) {
        response.on("close", () => cancelConnectionsClosed++);
        reply(response, request.protocol, {
          text: "Starting a long response.",
          end: false,
        });
        return;
      }
      if (text.includes("OBA_RECOVER")) {
        reply(response, request.protocol, { text: "Recovered." });
        return;
      }
      const results = toolResults(request);
      const flow = text.includes("OBA_FLOW");
      if (flow && !results.length) {
        reply(response, request.protocol, {
          text: "Waiting for confirmation. ",
          thinking: "Ask before inspecting.",
          calls: [
            {
              id: "question_call",
              name: "question",
              args: {
                questions: [
                  { question: "Continue?", options: [{ label: "Continue" }] },
                ],
              },
            },
          ],
        });
      } else if (results.length >= (flow ? 2 : 1)) {
        await delay(150);
        reply(response, request.protocol, {
          text: "Tabs verified; queued input acknowledged.",
        });
      } else
        reply(response, request.protocol, {
          text: "Checking browser tabs. ",
          thinking: "Use the tab tool.",
          calls: [
            {
              id: "browser_call",
              name: "manageTabs",
              args: { operation: "list" },
            },
          ],
        });
    });
let chromium;
try {
  chromium = await launchExtension({ headed });
  const version = (await chromium.browser.send("Browser.getVersion")).product;
  const sidepanel = await chromium.open(
    `chrome-extension://${chromium.id}/sidepanel.html`,
  );
  const options = await chromium.open(
    `chrome-extension://${chromium.id}/options.html`,
  );
  for (const page of [sidepanel, options])
    await poll(() =>
      page.call(
        () => document.querySelector("#root")?.textContent?.trim().length > 30,
      ),
    );
  const providers = live
    ? [process.env.OBA_PROVIDER || "openai"]
    : ["openai", "openai-responses", "anthropic", "gemini", "ollama"];
  const results = [];
  let composer;
  for (const provider of providers) {
    const config = live
      ? {
          provider,
          model: process.env.OBA_MODEL,
          baseUrl: process.env.OBA_BASE_URL,
          apiKey: process.env.OBA_API_KEY || "",
        }
      : {
          provider,
          model: "fixture",
          apiKey: "",
          baseUrl: `${fixture.baseUrl}${provider === "ollama" ? "" : provider === "gemini" ? "/v1beta" : "/v1"}`,
        };
    const result = await sidepanel.call(runInExtension, { ...config, live });
    // No raw model text, URLs, errors, headers or credential-bearing values are logged.
    assert.equal(
      result.ok,
      true,
      `Extension acceptance failed at ${result.stage} (${provider})${!live && result.diagnostic ? `: ${JSON.stringify(result.diagnostic)}` : ""}`,
    );
    results.push({ provider, ...result });
    if (!composer) composer = await checkComposer(sidepanel, config);
  }
  if (!live) {
    assert.ok(
      cancelConnectionsClosed >= providers.length,
      "Cancellation must close each provider HTTP stream",
    );
    for (const provider of providers)
      assert.ok(
        fixture.requests.some(
          (request) =>
            request.protocol ===
              (provider === "ollama" ? "openai" : provider) &&
            toolResults(request).length,
        ),
        `Missing ${provider} tool replay`,
      );
  }
  console.log(
    JSON.stringify(
      {
        evidence: live ? "real model" : "controlled HTTP fixtures",
        headed,
        browser: version,
        checks: [
          "production extension installed in disposable profile",
          "sidepanel and options rendered",
          "React composer submitted, answer rendered and tool/chat parts persisted",
          "provider text/reasoning streams",
          "browser tool executed",
          "edited/deleted queue input handled by Pi",
          "mid-run port reconnect and completed replay are contiguous",
          "cancellation and replacement run",
        ],
        results,
        composer,
        ...(live
          ? {}
          : {
              cancelConnectionsClosed,
              providerRequests: fixture.requests.length,
            }),
      },
      null,
      2,
    ),
  );
} finally {
  await chromium?.close();
  await fixture?.close();
}

async function runInExtension(config) {
  let stage = "configuration";
  try {
    await chrome.storage.local.set({
      provider: {
        acceptance: {
          id: "acceptance",
          type: config.provider,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          models: [{ id: "acceptance-model", name: config.model }],
        },
      },
      "debug-logging-enabled": false,
    });
    const request = (chatId, content, maxToolSteps = 3) => ({
      type: "sendMessages",
      chatId,
      messageId: `${chatId}-answer`,
      messages: [
        { id: `${chatId}-user`, role: "user", content, createdAt: Date.now() },
      ],
      body: {
        modelId: "acceptance-model",
        language: "en",
        maxToolSteps,
        agentCapabilities: {
          browserTools: true,
          browserAutomation: true,
          deferredBrowserTools: false,
        },
      },
    });
    const collect = (
      initial,
      { reconnect = false, queue = false, abort = false } = {},
    ) =>
      new Promise((resolve) => {
        const events = [];
        let port;
        let acted = false;
        let settled = false;
        const finish = (timedOut = false) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          port?.disconnect();
          resolve({ events, timedOut, acted });
        };
        const timer = setTimeout(() => {
          port?.postMessage({ type: "abort" });
          finish(true);
        }, 150000);
        const connect = (message) => {
          port = chrome.runtime.connect({ name: "ai-stream" });
          const connection = port;
          port.onMessage.addListener((event) => {
            if (settled || connection !== port) return;
            events.push(event);
            if (event.type === "end" || event.type === "error") {
              finish();
              return;
            }
            const progress =
              event.type === "chunk" &&
              (event.chunk.type === "text-delta" ||
                event.chunk.type === "reasoning-delta" ||
                event.chunk.state === "input-available");
            const question =
              event.chunk?.toolName === "question" &&
              event.chunk?.state === "input-available";
            if (!progress || acted || (queue && !question)) return;
            acted = true;
            if (abort) {
              port.postMessage({ type: "abort" });
              setTimeout(() => finish(), 200);
              return;
            }
            if (queue) {
              port.postMessage({
                type: "queueMessage",
                id: "keep",
                content: "Old queue draft",
              });
              port.postMessage({
                type: "queueMessage",
                id: "keep",
                content:
                  "Please acknowledge this queued input and summarize the browser tab tool result. Use manageTabs with operation=list if you have not called it yet.",
              });
              port.postMessage({
                type: "queueMessage",
                id: "delete",
                content: "This message must be removed.",
              });
              port.postMessage({ type: "deleteQueuedMessage", id: "delete" });
            }
            if (reconnect) {
              port.disconnect();
              port = undefined;
              setTimeout(() => {
                if (!settled) {
                  connect({
                    type: "attachStream",
                    chatId: initial.chatId,
                    afterSequence: event.sequence,
                  });
                  if (question)
                    port.postMessage({
                      type: "answerQuestion",
                      toolCallId: event.chunk.toolCallId,
                      answers: [
                        { question: "Continue?", answers: ["Continue"] },
                      ],
                    });
                }
              }, 100);
            }
          });
          port.postMessage(message);
        };
        connect(initial);
      });
    stage = "stream/tools/queue/reconnect";
    const chatId = crypto.randomUUID();
    const flow = await collect(
      request(
        chatId,
        "OBA_FLOW: First call question with one question 'Continue?' and one option 'Continue', and wait for the answer. After the answer, call manageTabs with operation=list to inspect the open tabs. Then briefly report the tab count. Start with a short sentence about what you will do.",
      ),
      { reconnect: true, queue: true },
    );
    if (flow.timedOut || flow.events.some((event) => event.type === "error"))
      return {
        ok: false,
        stage,
        ...(!config.live
          ? {
              diagnostic: {
                timedOut: flow.timedOut,
                errors: flow.events
                  .filter((event) => event.type === "error")
                  .map((event) => event.error),
              },
            }
          : {}),
      };
    const deltas = flow.events.filter(
      (event) => event.chunk?.type === "text-delta",
    );
    const tools = flow.events.filter(
      (event) =>
        event.chunk?.toolName === "manageTabs" &&
        event.chunk?.state === "output-available",
    );
    const queued = flow.events.flatMap((event) =>
      event.type === "queuedMessages" ? event.messages : [],
    );
    const sequences = flow.events.map((event) => event.sequence);
    if (
      !deltas.length ||
      !tools.length ||
      queued.length !== 1 ||
      queued[0].id !== "keep" ||
      queued[0].content === "Old queue draft" ||
      sequences.some((sequence, index) => sequence !== index + 1) ||
      flow.events.at(-1)?.type !== "end"
    )
      return {
        ok: false,
        stage,
        diagnostic: {
          textDeltas: deltas.length,
          tools: tools.length,
          queued: queued.length,
          sequences,
        },
      };
    stage = "completed replay";
    const replay = await collect({
      type: "attachStream",
      chatId,
      afterSequence: 1,
    });
    if (JSON.stringify(replay.events) !== JSON.stringify(flow.events.slice(1)))
      return { ok: false, stage };
    stage = "cancellation";
    const cancelChat = crypto.randomUUID();
    const cancelled = await collect(
      request(
        cancelChat,
        "OBA_CANCEL: Write a detailed 3000-word explanation of browser history, numbered in 100 sections. Begin immediately and keep writing.",
        0,
      ),
      { abort: true },
    );
    if (!cancelled.acted || cancelled.timedOut) return { ok: false, stage };
    const missing = await collect({
      type: "attachStream",
      chatId: cancelChat,
      afterSequence: 0,
    });
    if (
      missing.events.length !== 1 ||
      missing.events[0].type !== "end" ||
      missing.events[0].sequence
    )
      return { ok: false, stage };
    stage = "replacement run";
    const recovered = await collect(
      request(cancelChat, "OBA_RECOVER: Say recovered.", 0),
    );
    if (
      recovered.timedOut ||
      recovered.events.some((event) => event.type === "error") ||
      !recovered.events.some((event) => event.chunk?.type === "text-delta")
    )
      return { ok: false, stage };
    return {
      ok: true,
      stage: "complete",
      streamEvents: flow.events.length,
      textDeltas: deltas.length,
      reasoningDeltas: flow.events.filter(
        (event) => event.chunk?.type === "reasoning-delta",
      ).length,
      browserToolResults: tools.length,
      queueAcknowledgements: queued.length,
      replayEvents: replay.events.length,
      cancelledAfterProgress: cancelled.acted,
      replacementCompleted: true,
    };
  } catch {
    return { ok: false, stage };
  } finally {
    await chrome.storage.local.remove("provider");
  }
}
