import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { BUILTIN_SKILLS } from "../src/shared/builtin-skills.ts";
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
//        [--skills off] (turns every built-in skill off, to measure a skill)
// A frozen build records where it came from, so reports name the build's
// commit, not the repository's:
//   cp -r .output/chrome-mv3 DIR && git rev-parse --short HEAD > DIR/build-commit.txt
const { values: args } = parseArgs({
  options: {
    tasks: { type: "string" },
    "skip-live": { type: "boolean" },
    out: { type: "string" },
    compare: { type: "string" },
    timeout: { type: "string", default: "600" },
    extension: { type: "string" },
    skills: { type: "string", default: "on" },
  },
});
// "off" runs with every built-in skill turned off.
const skillSettings =
  args.skills === "off"
    ? Object.fromEntries(
        BUILTIN_SKILLS.map((skill) => [skill.id, { invoke: "off" }]),
      )
    : {};
const extensionDir = resolve(args.extension || ".output/chrome-mv3");
const buildCommit = await readFile(`${extensionDir}/build-commit.txt`, "utf8")
  .then((text) => text.trim())
  .catch(() => {
    if (args.extension)
      throw new Error(`${extensionDir}/build-commit.txt is missing`);
    // The working tree's own build; dirty when files changed since HEAD.
    const head = execSync("git rev-parse --short HEAD").toString().trim();
    const dirty = execSync("git status --porcelain --untracked-files=no")
      .toString()
      .trim();
    return dirty ? `${head}-dirty` : head;
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
    commit: buildCommit,
    extension: extensionDir,
    skills: args.skills,
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
    extension: extensionDir,
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
          "skill-settings": config.skillSettings,
        });
      },
      { ...env, baseUrl: `${server.origin}/v1`, skillSettings },
    );
    await panel.send("Page.reload");
    await poll(() =>
      panel.call(() => !!document.querySelector(".composer-box textarea")),
    );
    const page = (match) =>
      chromium.attach((url) =>
        url.includes(
          match.startsWith("/") ? `${server.origin}${match}` : match,
        ),
      );
    const prepared = await task.prepare?.({ page });
    // Wait for the active tab to be attached as context.
    await delay(1500);
    const startedAt = Date.now();
    // Follow-up prompts are sent in the same chat once the previous run ended.
    const runs = [];
    for (const prompt of [task.prompt, ...(task.followUps || [])]) {
      const run = await ask(panel, prompt);
      runs.push({ ...run, callsAfter: server.state.calls.length });
      if (run.timedOut || (run.question && !task.allowQuestion)) break;
    }
    const run = runs.at(-1);
    const wallMs = (run.endedAt || Date.now()) - startedAt;
    const answer = run.answer || "";
    const verdict = run.timedOut
      ? { ok: false, detail: { timedOut: true } }
      : run.question && !task.allowQuestion
        ? { ok: false, detail: { askedQuestion: true } }
        : await task.check({
            answer,
            runs,
            question: run.questionText,
            posts: server.state.posts,
            page,
            panel,
            prepared,
          });
    return {
      id: task.id,
      ...(task.skill ? { skill: task.skill } : {}),
      live: !!task.live,
      informational: !!task.informational,
      ok: verdict.ok,
      detail: verdict.detail,
      wallMs,
      toolCalls: runs.reduce((all, item) => {
        for (const [name, count] of Object.entries(item.toolCalls || {}))
          all[name] = (all[name] || 0) + count;
        return all;
      }, {}),
      attachedTabs: runs[0].attachedTabs,
      ...(runs.length > 1 ? { turns: turnMetrics(runs) } : {}),
      skillsRead: [...new Set(runs.flatMap((item) => item.skillsRead || []))],
      answerChars: answer.length,
      ...(verdict.ok ? {} : { answer: answer.slice(0, 4000) }),
      ...callMetrics(server.state.calls),
    };
  } finally {
    await chromium.close();
  }
}

// Agent requests and their input tokens, per prompt of a multi-turn task.
function turnMetrics(runs) {
  const agent = (calls) => calls.filter((call) => !call.aux && !call.helper);
  return runs.map((run, index) => {
    const calls = agent(
      server.state.calls.slice(
        index ? runs[index - 1].callsAfter : 0,
        run.callsAfter,
      ),
    );
    const input = calls.map(
      (call) => call.input + call.cacheRead + call.cacheWrite,
    );
    return {
      agentCalls: calls.length,
      agentInputTokens: input.reduce((sum, value) => sum + value, 0),
      firstRequestTokens: input[0] || 0,
      cachedInputTokens: calls.reduce((sum, call) => sum + call.cacheRead, 0),
    };
  });
}

// Sends `prompt` through the side panel composer and waits for its run.
async function ask(panel, prompt) {
  await panel.call((text) => {
    const textarea = document.querySelector(".composer-box textarea");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set;
    textarea.focus();
    setter.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, prompt);
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
  return poll(
    () => panel.call(readRun, prompt),
    Number(args.timeout) * 1000,
  ).catch(() => ({ timedOut: true }));
}

function callMetrics(calls) {
  const main = calls.filter((call) => !call.aux);
  const agent = main.filter((call) => !call.helper);
  const helper = main.filter((call) => call.helper);
  const input = (call) => call.input + call.cacheRead + call.cacheWrite;
  const sum = (items, value) =>
    items.reduce((total, call) => total + value(call), 0);
  const largest = agent.reduce(
    (best, call) => (input(call) > input(best || call) ? call : best || call),
    undefined,
  );
  return {
    modelCalls: main.length,
    failedCalls: main.filter((call) => call.status >= 400 || call.error).length,
    inputTokens: sum(main, input),
    cachedInputTokens: sum(main, (call) => call.cacheRead),
    cacheWriteTokens: sum(main, (call) => call.cacheWrite),
    outputTokens: sum(main, (call) => call.output),
    agentCalls: agent.length,
    agentInputTokens: sum(agent, input),
    agentCachedInputTokens: sum(agent, (call) => call.cacheRead),
    helperCalls: helper.length,
    helperInputTokens: sum(helper, input),
    // The agent's own largest request; helper requests carry page text.
    largestRequest: largest
      ? { inputTokens: input(largest), chars: largest.requestChars }
      : undefined,
    largestHelperRequestTokens: Math.max(0, ...helper.map(input)),
    toolSchemaChars: Math.max(0, ...agent.map((call) => call.toolsChars)),
    calls: main.map((call) => ({
      input: call.input,
      cacheRead: call.cacheRead,
      cacheWrite: call.cacheWrite,
      output: call.output,
      chars: call.requestChars,
      status: call.status,
      ...(call.helper ? { helper: true } : {}),
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
    const next = messages.findIndex(
      (message, at) => at > index && message.role === "user",
    );
    const replies = messages
      .slice(index + 1, next < 0 ? undefined : next)
      .filter((message) => message.role === "assistant");
    const parts = replies.flatMap((message) => message.parts || []);
    const asking = parts.find(
      (part) => part.toolName === "ask" && part.state === "input-available",
    );
    const question = !!asking;
    const last = replies.at(-1);
    const endedAt = last?.metadata?.runMetrics?.endedAt;
    if (!question && (!endedAt || document.querySelector(".stop-button")))
      return undefined;
    const toolCalls = {};
    const skillsRead = [];
    const seen = new Set();
    for (const part of parts) {
      if (!part.toolName || seen.has(part.id)) continue;
      seen.add(part.id);
      toolCalls[part.toolName] = (toolCalls[part.toolName] || 0) + 1;
      const source = String(part.input?.source || "");
      if (part.toolName === "read" && source.startsWith("skill:"))
        skillsRead.push(source.slice("skill:".length));
    }
    return {
      endedAt: endedAt || Date.now(),
      attachedTabs: messages[index].metadata?.attachedTabs?.length || 0,
      question,
      questionText: asking ? JSON.stringify(asking.input) : undefined,
      answer: replies.map((message) => message.content).join("\n"),
      toolCalls,
      toolInputs: parts.flatMap((part) =>
        part.toolName ? [{ name: part.toolName, input: part.input }] : [],
      ),
      skillsRead,
    };
  }
  return undefined;
}
