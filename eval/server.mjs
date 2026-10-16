import { createServer } from "node:http";
import { once } from "node:events";
import { appendFile } from "node:fs/promises";
import {
  articlePage,
  faqPage,
  formPage,
  inventoryPage,
  laptopPage,
  newsPage,
} from "./fixture-pages.mjs";
import {
  blogIndexPage,
  blogPostPage,
  checkoutPage,
  issuesPage,
  messengerPage,
  ordersPage,
  settingsPage,
  todosPage,
} from "./fixture-pages-apps.mjs";
import {
  catalogPage,
  factCheckPage,
  loadMorePage,
  researchHubPage,
  researchSourcePage,
} from "./fixture-pages-skills.mjs";
import { coveredPage, quizPage } from "./fixture-pages-tools.mjs";

const PAGES = {
  "/article": articlePage,
  "/news": newsPage,
  "/form": formPage,
  "/inventory": inventoryPage,
  "/laptop/a": () => laptopPage("a"),
  "/laptop/b": () => laptopPage("b"),
  "/laptop/c": () => laptopPage("c"),
  "/help": faqPage,
  "/checkout": checkoutPage,
  "/settings": settingsPage,
  "/issues": issuesPage,
  "/orders": ordersPage,
  "/blog": blogIndexPage,
  "/todos": todosPage,
  "/messenger": messengerPage,
  "/research": researchHubPage,
  "/factcheck": factCheckPage,
  "/catalog": catalogPage,
  "/catalog-more": loadMorePage,
  "/quiz": quizPage,
  "/covered": coveredPage,
};

// One local server for fixture pages, their form endpoints, and a recording
// proxy in front of the real model provider (`/v1/*`).
export async function startServer({ upstream }) {
  const state = { posts: [], calls: [] };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (url.pathname.startsWith("/v1/"))
      return proxy({ request, response, body, url, upstream, state });
    if (url.pathname.startsWith("/api/")) {
      const data = JSON.parse(body.toString() || "{}");
      const code = `OSL-${4000 + state.posts.length * 7 + body.length}`;
      state.posts.push({ path: url.pathname, data, code });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, code }));
      return;
    }
    const post = url.pathname.match(/^\/blog\/post-(\d+)$/);
    const source = url.pathname.match(/^\/research\/(\w+)$/);
    const html = post
      ? blogPostPage(Number(post[1]))
      : source
        ? researchSourcePage(source[1])
        : PAGES[url.pathname]?.(url);
    if (!html) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    state,
    origin: `http://127.0.0.1:${server.address().port}`,
    reset() {
      state.posts = [];
      state.calls = [];
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// Forwards the request unchanged and records size and usage per model call.
// Request bodies and headers are never written anywhere.
async function proxy({ request, response, body, url, upstream, state }) {
  const startedAt = Date.now();
  const text = body.toString();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Non-JSON requests are forwarded and recorded by size only. */
  }
  const call = {
    startedAt,
    requestChars: text.length,
    toolsChars: JSON.stringify(parsed.tools || []).length,
    messages: (parsed.messages || parsed.input || []).length,
    aux: /Create concise chat titles/.test(text),
    // Tool-less requests are helper-model work (extract, compaction,
    // sub-agent summaries), not the agent's own turns.
    helper: !(parsed.tools || []).length,
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    status: 0,
  };
  state.calls.push(call);
  // OBA_EVAL_DUMP=file appends every model request, to read transcripts.
  if (process.env.OBA_EVAL_DUMP && !call.aux)
    await appendFile(process.env.OBA_EVAL_DUMP, `${JSON.stringify(parsed)}\n`);
  const headers = { ...request.headers };
  delete headers.host;
  delete headers["content-length"];
  delete headers.connection;
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${upstream}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : body,
    });
  } catch {
    call.status = 599;
    response.writeHead(502).end("Upstream unreachable");
    return;
  }
  call.status = upstreamResponse.status;
  const responseHeaders = {};
  upstreamResponse.headers.forEach((value, key) => {
    if (
      !["content-encoding", "content-length", "transfer-encoding"].includes(key)
    )
      responseHeaders[key] = value;
  });
  response.writeHead(upstreamResponse.status, responseHeaders);
  let pending = "";
  const decoder = new TextDecoder();
  try {
    for await (const chunk of upstreamResponse.body) {
      response.write(chunk);
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) readUsage(line, call);
    }
  } catch (error) {
    // An upstream stream that breaks off reaches the extension as the same
    // dropped connection, and the run goes on.
    call.error = error.cause?.code || error.message;
    call.endedAt = Date.now();
    response.destroy();
    return;
  }
  readUsage(pending, call);
  call.endedAt = Date.now();
  response.end();
}

function readUsage(line, call) {
  const data = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!data.startsWith("{")) return;
  let event;
  try {
    event = JSON.parse(data);
  } catch {
    return;
  }
  // `call.input` is uncached input. OpenAI counts cached tokens inside the
  // prompt total; Anthropic reports them separately.
  const openai = event.usage?.prompt_tokens !== undefined ? event.usage : null;
  if (openai) {
    const cached = openai.prompt_tokens_details?.cached_tokens || 0;
    call.input = openai.prompt_tokens - cached;
    call.cacheRead = cached;
    call.output = openai.completion_tokens || 0;
    return;
  }
  const responses = event.response?.usage;
  if (responses) {
    const cached = responses.input_tokens_details?.cached_tokens || 0;
    call.input = responses.input_tokens - cached;
    call.cacheRead = cached;
    call.output = responses.output_tokens || 0;
    return;
  }
  // Anthropic: message_start carries input usage, message_delta output usage.
  const usage = event.message?.usage || event.usage;
  if (usage && ("input_tokens" in usage || "output_tokens" in usage)) {
    if (usage.input_tokens !== undefined) call.input = usage.input_tokens;
    if (usage.cache_read_input_tokens !== undefined)
      call.cacheRead = usage.cache_read_input_tokens;
    if (usage.cache_creation_input_tokens !== undefined)
      call.cacheWrite = usage.cache_creation_input_tokens;
    if (usage.output_tokens !== undefined) call.output = usage.output_tokens;
  }
  if (
    event.type === "content_block_start" &&
    event.content_block?.type === "tool_use"
  )
    (call.toolCalls ||= []).push(event.content_block.name);
  if (event.type === "error" || event.error)
    call.error = event.error?.type || "error";
}
