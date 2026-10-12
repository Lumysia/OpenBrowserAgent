import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "../tests/chromium.mjs";
import { renderReport, summarize } from "./report.mjs";
import { startServer } from "./server.mjs";
import { TASKS } from "./tasks.mjs";

// Real-model eval of the production build (`npm run build:chrome` first).
// Provider settings come from the environment only:
//   OBA_EVAL_BASE_URL (ending in /v1), OBA_EVAL_API_KEY, OBA_EVAL_MODEL,
//   OBA_EVAL_PROVIDER (default openai: Chat Completions), OBA_EVAL_CONTEXT_LENGTH (optional).
// Usage: npm run eval -- [--tasks id,id] [--skip-live] [--out path/name]
//        [--compare baseline.json] [--extension built-extension-dir]
const { values: args } = parseArgs({
  options: {
    tasks: { type: "string" },
    "skip-live": { type: "boolean" },
    out: { type: "string" },
    compare: { type: "string" },
    timeout: { type: "string", default: "600" },
    extension: { type: "string" },
  },
});
const env = {
  provider: process.env.OBA_EVAL_PROVIDER || "openai",
  baseUrl: process.env.OBA_EVAL_BASE_URL?.replace(/\/$/, ""),
  apiKey: process.env.OBA_EVAL_API_KEY || "",
  model: process.env.OBA_EVAL_MODEL,
  contextLength: Number(process.env.OBA_EVAL_CONTEXT_LENGTH) || undefined,
};
if (!env.baseUrl?.endsWith("/v1") || !env.model)
  throw new Error("Set OBA_EVAL_BASE_URL (ending in /v1) and OBA_EVAL_MODEL");
// Keep the key out of every child process environment.
for (const [key, value] of Object.entries(process.env))
  if (env.apiKey && value === env.apiKey) delete process.env[key];

const selected = args.tasks?.split(",");
const tasks = TASKS.filter(
  (task) =>
    (!selected || selected.includes(task.id)) &&
    !(args["skip-live"] && task.live),
);
const server = await startServer({ upstream: env.baseUrl.slice(0, -3) });
const results = [];
try {
  for (const task of tasks) {
    process.stdout.write(`${task.id} ... `);
    const outcome = await runTask(task).catch((error) => ({
      ok: false,
      detail: { harnessError: error.message },
    }));
    results.push(outcome);
    console.log(
      `${outcome.ok ? "ok" : "FAIL"} (${outcome.modelCalls ?? "?"} calls, ${Math.round((outcome.wallMs || 0) / 1000)}s)`,
    );
  }
} finally {
  await server.close();
}

const report = {
  meta: {
    date: new Date().toISOString(),
    provider: env.provider,
    model: env.model,
    commit: execSync("git rev-parse --short HEAD").toString().trim(),
    branch: execSync("git rev-parse --abbrev-ref HEAD").toString().trim(),
  },
  totals: summarize(results),
  tasks: results,
};
const baseline = args.compare
  ? JSON.parse(await readFile(args.compare, "utf8"))
  : undefined;
const out = resolve(
  args.out || `eval-results/${report.meta.date.replace(/[:.]/g, "-")}`,
);
await mkdir(dirname(out), { recursive: true });
await writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(`${out}.md`, renderReport(report, baseline));
console.log(`Report: ${out}.json, ${out}.md`);

async function runTask(task) {
  server.reset();
  const chromium = await launchExtension({
    headed: false,
    ...(args.extension ? { extension: resolve(args.extension) } : {}),
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--window-size=1280,900",
    ],
  });
  try {
    const urls = task.tabs.map((tab) =>
      tab.startsWith("/") ? `${server.origin}${tab}` : tab,
    );
    const pages = [];
    for (const url of urls) pages.push(await chromium.open(url));
    for (const target of await chromium.targets())
      if (target.type === "page" && target.url === "about:blank")
        await chromium.browser.send("Target.closeTarget", {
          targetId: target.id,
        });
    await pages[0].send("Page.bringToFront");
    // The side panel runs as a background tab of the same window, so its
    // "current window" active tab is the task page, as in the real panel.
    const panel = await chromium.open(
      `chrome-extension://${chromium.id}/sidepanel.html`,
      { background: true },
    );
    await panel.call(
      async (config) => {
        await chrome.storage.local.set({
          provider: {
            eval: {
              id: "eval",
              type: config.provider,
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              models: [
                {
                  id: "eval-model",
                  name: config.model,
                  ...(config.contextLength
                    ? { contextLength: config.contextLength }
                    : {}),
                },
              ],
            },
          },
          language: "en-US",
          preferences: { selectedModelId: "eval-model" },
        });
      },
      { ...env, baseUrl: `${server.origin}/v1` },
    );
    await panel.send("Page.reload");
    await poll(() =>
      panel.call(() => !!document.querySelector(".composer-box textarea")),
    );
    // Wait for the active tab to be attached as context.
    await delay(1500);
    const startedAt = Date.now();
    await panel.call((prompt) => {
      const textarea = document.querySelector(".composer-box textarea");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set;
      textarea.focus();
      setter.call(textarea, prompt);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }, task.prompt);
    await delay(300);
    await panel.call(() =>
      document.querySelector(".composer-box textarea").dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true,
        }),
      ),
    );
    const run = await poll(
      () => panel.call(readRun, task.prompt),
      Number(args.timeout) * 1000,
    ).catch(() => ({ timedOut: true }));
    const wallMs = (run.endedAt || Date.now()) - startedAt;
    const answer = run.answer || "";
    const verdict = run.timedOut
      ? { ok: false, detail: { timedOut: true } }
      : run.question
        ? { ok: false, detail: { askedQuestion: true } }
        : await task.check({
            answer,
            posts: server.state.posts,
            page: (match) =>
              chromium.attach((url) =>
                url.includes(
                  match.startsWith("/") ? `${server.origin}${match}` : match,
                ),
              ),
          });
    return {
      id: task.id,
      live: !!task.live,
      ok: verdict.ok,
      detail: verdict.detail,
      wallMs,
      toolCalls: run.toolCalls || {},
      attachedTabs: run.attachedTabs,
      answerChars: answer.length,
      ...(verdict.ok ? {} : { answer: answer.slice(0, 600) }),
      ...callMetrics(server.state.calls),
    };
  } finally {
    await chromium.close();
  }
}

function callMetrics(calls) {
  const main = calls.filter((call) => !call.aux);
  const input = (call) => call.input + call.cacheRead + call.cacheWrite;
  const largest = main.reduce(
    (best, call) => (input(call) > input(best || call) ? call : best || call),
    undefined,
  );
  return {
    modelCalls: main.length,
    failedCalls: main.filter((call) => call.status >= 400 || call.error).length,
    inputTokens: main.reduce((sum, call) => sum + input(call), 0),
    cachedInputTokens: main.reduce((sum, call) => sum + call.cacheRead, 0),
    cacheWriteTokens: main.reduce((sum, call) => sum + call.cacheWrite, 0),
    outputTokens: main.reduce((sum, call) => sum + call.output, 0),
    largestRequest: largest
      ? { inputTokens: input(largest), chars: largest.requestChars }
      : undefined,
    toolSchemaChars: Math.max(0, ...main.map((call) => call.toolsChars)),
    calls: main.map((call) => ({
      input: call.input,
      cacheRead: call.cacheRead,
      cacheWrite: call.cacheWrite,
      output: call.output,
      chars: call.requestChars,
      status: call.status,
    })),
  };
}

// Runs in the side panel: the finished run for `prompt`, or undefined.
async function readRun(prompt) {
  const stored = await chrome.storage.local.get(null);
  const chats = (stored.chats || []).map((chat) => ({
    ...chat,
    ...stored[`chats/${chat.id}`],
  }));
  for (const chat of chats) {
    const messages = chat.messages || [];
    const index = messages.findIndex(
      (message) => message.role === "user" && message.content === prompt,
    );
    if (index < 0) continue;
    const replies = messages
      .slice(index + 1)
      .filter((message) => message.role === "assistant");
    const parts = replies.flatMap((message) => message.parts || []);
    const question = parts.some(
      (part) => part.toolName === "ask" && part.state === "input-available",
    );
    const last = replies.at(-1);
    const endedAt = last?.metadata?.runMetrics?.endedAt;
    if (!question && (!endedAt || document.querySelector(".stop-button")))
      return undefined;
    const toolCalls = {};
    const seen = new Set();
    for (const part of parts) {
      if (!part.toolName || seen.has(part.id)) continue;
      seen.add(part.id);
      toolCalls[part.toolName] = (toolCalls[part.toolName] || 0) + 1;
    }
    return {
      endedAt: endedAt || Date.now(),
      attachedTabs: messages[index].metadata?.attachedTabs?.length || 0,
      question,
      answer: replies.map((message) => message.content).join("\n"),
      toolCalls,
    };
  }
  return undefined;
}
