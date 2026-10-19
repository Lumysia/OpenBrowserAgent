import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runTool } from "../src/background/tools/run-tool";
import type {
  RunContext,
  ToolContext,
  ToolDefinition,
} from "../src/background/tools/types";

const LIMIT_MS = 100;

// A page tool that waits on the page, asks the helper model, then waits on
// the page again.
function pageTool(pageMs: number): ToolDefinition {
  return {
    name: "fixturePage",
    group: "pages",
    effects: "read",
    timeoutMs: LIMIT_MS,
    summary: "",
    description: "",
    parameters: {},
    async execute(_input, { run, signal }) {
      await delay(pageMs, undefined, { signal });
      const answer = await run.askHelper("system", "prompt", signal);
      await delay(pageMs, undefined, { signal });
      return { text: answer };
    },
  };
}

function run(tool: ToolDefinition, askHelper: RunContext["askHelper"]) {
  const context = {
    run: { askHelper } as RunContext,
    toolCallId: "call",
    progress() {},
  } as ToolContext;
  return runTool(tool, {}, context, { current: [] });
}

test("a slow helper model does not use up a page tool's time limit", async () => {
  const outcome = await run(pageTool(20), async (_system, _prompt, signal) => {
    await delay(LIMIT_MS * 3, undefined, { signal });
    return "answer";
  });
  assert.equal(outcome.isError, false);
  assert.equal(outcome.text, "answer");
});

test("time on the page before and after a helper request adds up", async () => {
  const outcome = await run(pageTool(LIMIT_MS * 0.7), async () => "answer");
  assert.equal(outcome.isError, true);
  assert.equal(
    outcome.text,
    "fixturePage timed out after 0.1 s waiting for the browser. The page may be busy or showing a dialog; try again or take a screenshot.",
  );
});

test("helper model failures say they come from the helper model", async () => {
  const outcome = await run(pageTool(1), async () => {
    throw new Error("Request timed out.");
  });
  assert.equal(outcome.isError, true);
  assert.equal(
    outcome.text,
    "The helper model request failed: Request timed out.",
  );
});

test("stopping the run stops a pending helper request", async () => {
  const controller = new AbortController();
  let aborted = false;
  const running = runTool(
    pageTool(1),
    {},
    {
      run: {
        askHelper: (_system, _prompt, signal) =>
          new Promise<string>((_resolve, reject) =>
            signal?.addEventListener("abort", () => {
              aborted = true;
              reject(signal.reason);
            }),
          ),
      } as RunContext,
      toolCallId: "call",
      signal: controller.signal,
      progress() {},
    },
    { current: [] },
  );
  await delay(20);
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  assert.equal(aborted, true);
});

test("Cite as names sources the chat already has, with their ids", async () => {
  const tool: ToolDefinition = {
    name: "fixtureRead",
    effects: "read",
    summary: "",
    description: "",
    parameters: {},
    async execute(input) {
      return {
        text: "Page text",
        sources: (input.urls as string[]).map((url) => ({
          kind: "page" as const,
          title: `Read ${url}`,
          url,
        })),
      };
    },
  };
  // Found earlier by a search.
  const sources = {
    current: [
      {
        id: "source_1",
        kind: "search" as const,
        title: "Search result A",
        url: "https://a.example/",
        createdAt: 1,
      },
    ],
  };
  const context = {
    run: {} as RunContext,
    toolCallId: "call",
    progress() {},
  } as ToolContext;
  const outcome = await runTool(
    tool,
    {
      urls: ["https://a.example/", "https://b.example/", "https://a.example/"],
    },
    context,
    sources,
  );
  assert.equal(
    outcome.text,
    "Page text\nCite as: [[cite:source_1]] Search result A; [[cite:source_2]] Read https://b.example/",
  );
  assert.deepEqual(
    sources.current.map((source) => source.id),
    ["source_1", "source_2"],
  );
  // Only the new source is stored with the step.
  assert.deepEqual(
    (outcome.output._sources as Array<{ id: string }>).map(
      (source) => source.id,
    ),
    ["source_2"],
  );

  const again = await runTool(
    tool,
    { urls: ["https://a.example/"] },
    context,
    sources,
  );
  assert.equal(
    again.text,
    "Page text\nCite as: [[cite:source_1]] Search result A",
  );
  assert.equal(again.output._sources, undefined);
});
