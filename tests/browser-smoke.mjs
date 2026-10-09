import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Requires npm run build:chrome and Chromium on PATH (or CHROMIUM set). The
// temporary profile is created inside .output and never uses a personal profile.
const profile = await mkdtemp(resolve(".output/smoke-profile-"));
const extension = resolve(".output/chrome-mv3");
const documents = new Map();
const requests = [];
let modelCalls = 0;
let toolResult;
const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.url === "/v1/chat/completions") {
      modelCalls++;
      const payload = JSON.parse(body.toString());
      toolResult =
        payload.messages.find((message) => message.role === "tool") ||
        toolResult;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const send = (delta) =>
        response.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
      if (modelCalls === 1) {
        send({ content: "Checking tabs. " });
        send({
          tool_calls: [
            {
              index: 0,
              id: "smoke-tool",
              type: "function",
              function: { name: "manageTabs", arguments: '{"operation":' },
            },
          ],
        });
        send({
          tool_calls: [{ index: 0, function: { arguments: '"list"}' } }],
        });
      } else {
        send({ content: "Tabs checked. " });
        await delay(30);
        send({ content: "Done." });
      }
      response.end("data: [DONE]\n\n");
      return;
    }
    requests.push({ method: request.method, headers: request.headers });
    const current = documents.get(request.url);
    if (request.method === "GET") {
      if (!current) {
        response.writeHead(404).end();
        return;
      }
      if (request.headers["if-none-match"] === current.etag) {
        response.writeHead(304).end();
        return;
      }
      response.writeHead(200, { ETag: current.etag }).end(current.body);
    } else if (request.method === "PUT") {
      const valid = current
        ? request.headers["if-match"] === current.etag
        : request.headers["if-none-match"] === "*";
      if (!valid) {
        response.writeHead(412).end();
        return;
      }
      const etag = `"v${(current?.version || 0) + 1}"`;
      documents.set(request.url, {
        etag,
        body,
        version: (current?.version || 0) + 1,
      });
      response.writeHead(204, { ETag: etag }).end();
    } else response.writeHead(405).end();
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const chromium = spawn(
  process.env.CHROMIUM || "chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  {
    env: { ...process.env, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let stderr = "";
chromium.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-16_000);
});
let browser;
let page;
try {
  const websocketUrl = await poll(
    () => stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1],
  );
  const debugUrl = new URL(websocketUrl);
  const targetsUrl = `http://${debugUrl.host}/json/list`;
  const worker = await poll(async () =>
    (await (await fetch(targetsUrl)).json()).find(
      (target) =>
        target.type === "service_worker" &&
        target.url.startsWith("chrome-extension://"),
    ),
  );
  const extensionId = new URL(worker.url).host;
  browser = await connect(websocketUrl);
  const { targetId } = await browser.send("Target.createTarget", {
    url: `chrome-extension://${extensionId}/sidepanel.html`,
  });
  const target = await poll(async () =>
    (await (await fetch(targetsUrl)).json()).find(
      (item) => item.id === targetId,
    ),
  );
  page = await connect(target.webSocketDebuggerUrl);
  await poll(async () => {
    const ready = await page.send("Runtime.evaluate", {
      expression:
        "typeof chrome !== 'undefined' && !!chrome.runtime?.id && document.readyState === 'complete'",
      returnByValue: true,
    });
    return ready.result?.value;
  });
  const result = await page.send("Runtime.evaluate", {
    expression: `(${runInExtension.toString()})(${JSON.stringify(baseUrl)})`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(
    result.exceptionDetails,
    undefined,
    JSON.stringify(result.exceptionDetails),
  );
  const value = result.result.value;
  assert.deepEqual(value.browserValue, { theme: "dark" });
  assert.deepEqual(value.davValue, [
    { id: "keep", name: "retained", nullable: null },
  ]);
  assert.deepEqual(value.warmValue, value.davValue);
  assert.equal(
    value.events.some((event) => event.type === "error"),
    false,
    JSON.stringify(value.events),
  );
  assert.equal(
    value.events
      .filter((event) => event.chunk?.type === "text-delta")
      .map((event) => event.chunk.delta)
      .join(""),
    "Checking tabs. Tabs checked. Done.",
  );
  assert.ok(
    value.events.some(
      (event) =>
        event.chunk?.toolName === "manageTabs" &&
        event.chunk?.state === "output-available",
    ),
  );
  assert.deepEqual(
    value.replayed,
    value.events.filter((event) => event.sequence > 1),
  );
  assert.equal(modelCalls, 2);
  assert.equal(toolResult?.tool_call_id, "smoke-tool");
  assert.ok(JSON.parse(toolResult.content));
  assert.ok(requests.some((request) => request.headers["if-match"]));
  assert.ok(
    requests.some(
      (request) => request.headers["if-none-match"] && request.method === "GET",
    ),
  );
  console.log(
    JSON.stringify(
      {
        browser: (await browser.send("Browser.getVersion")).product,
        checks: [
          "production extension loaded",
          "real chrome.storage.sync RPC round trip",
          "WebDAV conditional writes and 304 reads over loopback HTTP",
          "deleted rows and legitimate null preserved",
          "live SSE text + fragmented tool arguments",
          "manageTabs executed and result sent to provider",
          "port reconnect replay has no missing or duplicate events",
        ],
        events: value.events.length,
        modelCalls,
      },
      null,
      2,
    ),
  );
} finally {
  page?.close();
  browser?.close();
  chromium.kill("SIGTERM");
  if (chromium.exitCode === null) await once(chromium, "exit");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}

async function runInExtension(baseUrl) {
  const rpc = async (backendConfig, operation, key, value) => {
    const response = await chrome.runtime.sendMessage({
      type: "sync-backend.request",
      backendConfig,
      operation,
      key,
      value,
    });
    if (!response?.ok) throw new Error(response?.error || "No response");
    return response.value;
  };
  const browserBackend = {
    id: "smoke-browser",
    type: "browser-sync",
    name: "Smoke",
  };
  await rpc(browserBackend, "write", "smoke-record", { theme: "dark" });
  const browserValue = await rpc(browserBackend, "read", "smoke-record");
  const davBackend = {
    id: "smoke-dav",
    type: "webdav",
    name: "Smoke",
    url: `${baseUrl}/dav/`,
  };
  await rpc(davBackend, "write", "smoke-array", [
    { id: "keep", name: "retained", nullable: null },
    { id: "delete", name: "removed" },
  ]);
  await rpc(davBackend, "write", "smoke-array", [
    { id: "keep", name: "retained", nullable: null },
  ]);
  const davValue = await rpc(davBackend, "read", "smoke-array");
  const warmValue = await rpc(davBackend, "read", "smoke-array");
  await chrome.storage.local.set({
    provider: {
      smoke: {
        id: "smoke",
        type: "openai",
        baseUrl: `${baseUrl}/v1`,
        models: [{ id: "smoke-model", name: "smoke-model" }],
      },
    },
  });
  const collect = (request) =>
    new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: "ai-stream" });
      const events = [];
      const timer = setTimeout(() => {
        port.disconnect();
        reject(new Error("Stream timed out"));
      }, 15_000);
      port.onMessage.addListener((event) => {
        events.push(event);
        if (event.type === "end" || event.type === "error") {
          clearTimeout(timer);
          port.disconnect();
          resolve(events);
        }
      });
      port.postMessage(request);
    });
  const events = await collect({
    type: "sendMessages",
    chatId: "smoke-chat",
    messageId: "answer",
    messages: [
      {
        id: "question",
        role: "user",
        content: "List the open tabs",
        createdAt: Date.now(),
      },
    ],
    body: {
      modelId: "smoke-model",
      language: "en",
      maxToolSteps: 2,
      agentCapabilities: {
        browserTools: true,
        browserAutomation: true,
        deferredBrowserTools: false,
      },
    },
  });
  const replayed = await collect({
    type: "attachStream",
    chatId: "smoke-chat",
    messageId: "answer",
    afterSequence: 1,
  });
  return { browserValue, davValue, warmValue, events, replayed };
}

async function poll(getValue) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await getValue();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Chromium target did not become ready. ${stderr}`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const current = ++id;
        pending.set(current, { resolve, reject });
        socket.send(JSON.stringify({ id: current, method, params }));
      });
    },
    close: () => socket.close(),
  };
}
