import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture } from "./browser-tool-fixture.mjs";

// The built extension runs model code in QuickJS inside the sandboxed page
// of the offscreen document: results, limits and workspace files are
// checked end to end through the agent loop.
const CSV = "item,amount\napples,12.5\npears,7.25\nplums,30\n";

test("runCode computes, stops, isolates and saves files", async (t) => {
  const fixture = await browserToolFixture();
  try {
    await fixture.page.call(async () => {
      const { agents } = await chrome.storage.local.get("agents");
      await chrome.storage.local.set({
        agents: agents.map((agent) => ({ ...agent, workspace: true })),
      });
    });

    await t.test("a CSV sum round-trips through the workspace", async () => {
      const texts = await fixture.run([
        { name: "toolSearch", args: { names: ["runCode", "workspace"] } },
        {
          name: "workspace",
          args: { action: "write", path: "data.csv", content: CSV },
        },
        {
          name: "runCode",
          args: {
            code: `const rows = readFile("data.csv").trim().split("\\n").slice(1);
const total = rows.reduce((sum, row) => sum + Number(row.split(",")[1]), 0);
console.log("rows", rows.length);
writeFile("out/total.txt", "total=" + total);
({ total, label: input.label })`,
            input: { label: "fruit" },
            files: ["data.csv"],
          },
        },
        { name: "read", args: { source: "workspace:out/total.txt" } },
      ]);
      assert.match(texts[2], /\[The code ran in \d+ ms\]/);
      assert.match(texts[2], /Output:\nrows 3/);
      assert.match(texts[2], /Result: \{"total":49\.75,"label":"fruit"\}/);
      assert.match(texts[2], /Wrote workspace:out\/total\.txt \(11 chars\)/);
      assert.match(texts[3], /total=49\.75/);
      const outputs = await fixture.outputs();
      const run = outputs.find((item) => item.name === "runCode").output;
      assert.deepEqual(run.files, [{ path: "out/total.txt", chars: 11 }]);
      assert.equal(typeof run.durationMs, "number");
      // Chrome runs it in the sandboxed page of the offscreen document.
      assert.equal(run.isolation, "sandboxPage");
    });

    await t.test("an infinite loop stops at its deadline", async () => {
      const started = Date.now();
      const [, loop, after] = await fixture.run([
        { name: "toolSearch", args: { names: ["runCode"] } },
        { name: "runCode", args: { code: "while (true) {}", timeoutMs: 500 } },
        { name: "runCode", args: { code: "6 * 7" } },
      ]);
      assert.match(loop, /InternalError: interrupted/);
      assert.match(after, /Result: 42/);
      assert.ok(Date.now() - started < 20_000);
      const outputs = await fixture.outputs();
      const stopped = outputs.find((item) => item.output.stopped);
      assert.equal(stopped.output.stopped, "timeout");
      assert.ok(stopped.output.durationMs >= 500);
      assert.ok(stopped.output.durationMs < 3_000);
    });

    await t.test(
      "the code sees no network, DOM or extension APIs",
      async () => {
        const [, probe] = await fixture.run([
          { name: "toolSearch", args: { names: ["runCode"] } },
          {
            name: "runCode",
            args: {
              code: `["fetch", "XMLHttpRequest", "WebSocket", "importScripts", "chrome", "browser", "window", "document", "self", "postMessage", "setTimeout"].map((name) => name + ":" + typeof globalThis[name]).join(" ")`,
            },
          },
        ]);
        assert.match(
          probe,
          /fetch:undefined XMLHttpRequest:undefined WebSocket:undefined importScripts:undefined chrome:undefined browser:undefined window:undefined document:undefined self:undefined postMessage:undefined setTimeout:undefined/,
        );
      },
    );

    await t.test("a too-large allocation fails cleanly", async () => {
      const [, big, after] = await fixture.run([
        { name: "toolSearch", args: { names: ["runCode"] } },
        { name: "runCode", args: { code: `"x".repeat(2 ** 29).length` } },
        { name: "runCode", args: { code: `"still " + "working"` } },
      ]);
      assert.match(big, /InternalError: out of memory/);
      assert.match(after, /Result: "still working"/);
      const outputs = await fixture.outputs();
      assert.equal(
        outputs.find((item) => item.output.stopped).output.stopped,
        "memory",
      );
    });
  } finally {
    await fixture.close();
  }
});
