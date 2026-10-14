import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { downloadsStartedSince } from "../src/background/downloads/page-downloads";
import { settleDownload } from "../src/background/downloads/tracker";
import { BUILTIN_TOOLS } from "../src/background/tools/registry";
import { runTool } from "../src/background/tools/run-tool";
import type { ToolContext } from "../src/background/tools/types";
import { DOWNLOAD_STATUS } from "../src/shared/downloads";
import { downloadsBrowser, EXTENSION_ID } from "./download-fixtures";
import { installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

async function tool(
  input: Record<string, unknown>,
  run: Record<string, unknown> = {},
) {
  const definition = BUILTIN_TOOLS.find((entry) => entry.name === "downloads")!;
  const context = {
    run: { chatId: "chat-a", attachments: [], ...run },
    toolCallId: "call",
    progress() {},
  } as unknown as ToolContext;
  return runTool(definition, input, context, { current: [] });
}
test("waiting returns on the outcome, or when the user must act", async () => {
  const browser = downloadsBrowser();
  const run = { chatId: "chat-a" };
  const { id } = browser.add({ filename: "/d/a.zip" });
  const waiting = settleDownload(run, id, 5000);
  await setImmediate();
  browser.update(id, { bytesReceived: 10 });
  browser.update(id, { state: "complete", fileSize: 20 });
  assert.equal((await waiting)?.status, DOWNLOAD_STATUS.completed);

  const held = browser.add({ filename: "/d/b.exe" });
  const flagged = settleDownload(run, held.id, 5000);
  await setImmediate();
  browser.update(held.id, { danger: "file" });
  assert.equal((await flagged)?.status, DOWNLOAD_STATUS.needsConfirmation);
  // Already waiting for the user: wait until they act.
  const kept = settleDownload(run, held.id, 5000);
  await setImmediate();
  browser.update(held.id, { danger: "accepted" });
  browser.update(held.id, { state: "complete" });
  assert.equal((await kept)?.status, DOWNLOAD_STATUS.completed);

  const slow = browser.add({ filename: "/d/c.iso", totalBytes: 100 });
  const started = Date.now();
  assert.equal(
    (await settleDownload(run, slow.id, 50))?.status,
    DOWNLOAD_STATUS.inProgress,
  );
  assert.ok(Date.now() - started < 1500);
  assert.equal(await settleDownload(run, 999, 50), undefined);

  const controller = new AbortController();
  const aborted = settleDownload(run, slow.id, 5000, controller.signal);
  controller.abort();
  await assert.rejects(aborted, { name: "AbortError" });
});

test("downloads a click started are linked to the chat that clicked", async () => {
  const browser = downloadsBrowser();
  const since = Date.now() - 10;
  const own = { chatId: "chat-a" };
  browser.add({ filename: "/d/ours.bin", byExtensionId: EXTENSION_ID });
  const page = browser.add({ filename: "/d/invoice.pdf", state: "complete" });
  const records = await downloadsStartedSince(own, since);
  assert.deepEqual(
    records.map((record) => [record.id, record.status, record.mine]),
    [[page.id, DOWNLOAD_STATUS.completed, true]],
  );
  // Another chat does not get it, and this chat may cancel/retry it.
  assert.deepEqual(
    await downloadsStartedSince({ chatId: "chat-b" }, since),
    [],
  );
  const result = await tool({ action: "retry", id: page.id });
  assert.match(result.text, /Nothing to retry: it completed/);
  const foreign = await tool(
    { action: "cancel", id: page.id },
    { chatId: "chat-b" },
  );
  assert.equal(foreign.isError, true);
  assert.match(foreign.text, /not started by you in this chat/);
});

test("the tool downloads URLs, waits, cancels and retries its own", async () => {
  const browser = downloadsBrowser();
  const pending = tool({
    action: "download",
    url: "https://files.test/q3.csv",
    filename: "../q3",
    folder: "reports",
    timeoutSeconds: 5,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const id = [...browser.items.keys()].at(-1)!;
  browser.update(id, {
    filename: "/d/reports/q3",
    state: "complete",
    fileSize: 9,
    mime: "text/csv",
  });
  const done = await pending;
  assert.equal(done.isError, false);
  assert.deepEqual(browser.requests.at(-1), {
    url: "https://files.test/q3.csv",
    filename: "reports/q3",
    conflictAction: "uniquify",
  });
  assert.match(
    done.text,
    /#\d+ q3: completed, 9 B \(text\/csv\), saved at \/d\/reports\/q3/,
  );
  assert.equal(
    (done.output.downloads as Array<{ mine: boolean }>)[0].mine,
    true,
  );

  const failed = browser.add({
    url: "https://files.test/big.iso",
    filename: "/d/big.iso",
    state: "interrupted",
    error: "NETWORK_FAILED",
    byExtensionId: EXTENSION_ID,
  });
  const notMine = await tool({ action: "retry", id: failed.id });
  assert.match(notMine.text, /not started by you/);

  const running = await tool({
    action: "download",
    url: "https://files.test/big.iso",
    timeoutSeconds: 0,
  });
  const runningId = (running.output.downloads as Array<{ id: number }>)[0].id;
  assert.match(running.text, /still downloading/);
  const canceled = await tool({ action: "cancel", id: runningId });
  assert.deepEqual(browser.canceled, [runningId]);
  assert.match(canceled.text, /canceled; nothing was saved/);

  // Not resumable: the same URL and name start again as a new download.
  const retry = tool({ action: "retry", id: runningId, timeoutSeconds: 5 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const again = [...browser.items.keys()].at(-1)!;
  assert.notEqual(again, runningId);
  browser.update(again, { filename: "/d/big (1).iso", state: "complete" });
  const retried = await retry;
  assert.equal(retried.output.retriedId, runningId);
  assert.match(retried.text, /big \(1\)\.iso: completed/);

  // Resumable: the same download goes on.
  browser.update(again, {
    state: "interrupted",
    error: "NETWORK_FAILED",
    canResume: true,
  });
  const resume = tool({ action: "retry", id: again, timeoutSeconds: 5 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(browser.resumed, [again]);
  browser.update(again, { state: "complete" });
  assert.match((await resume).text, /completed/);

  assert.match(
    (await tool({ action: "download", url: "file:///etc/passwd" })).text,
    /http or https/,
  );
  assert.match(
    (await tool({ action: "wait", id: 12345 })).text,
    /No download with id 12345/,
  );
});

test("wait without an id takes the next download a page starts", async () => {
  const browser = downloadsBrowser();
  const waiting = tool({ action: "wait", timeoutSeconds: 5 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const page = browser.add({
    url: "https://shop.test/export",
    filename: "/d/export.csv",
  });
  browser.update(page.id, { state: "complete" });
  const result = await waiting;
  assert.match(result.text, /#\d+ export\.csv: completed/);
  // Its outcome has been told: the next wait looks for a new one.
  const next = await tool({ action: "wait", timeoutSeconds: 0 });
  assert.match(next.text, /No download started within 0 s/);
});

test("saving needs content or a source, and the list marks the chat's own", async () => {
  const browser = downloadsBrowser();
  mock.method(URL, "createObjectURL", () => "blob:fixture");
  mock.method(URL, "revokeObjectURL", () => {});
  const saving = tool(
    {
      action: "save",
      source: "workspace:notes/plan.md",
      filename: "plan",
      timeoutSeconds: 5,
    },
    {
      workspace: { files: [{ path: "notes/plan.md", content: "# Plan" }] },
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  const id = [...browser.items.keys()].at(-1)!;
  assert.deepEqual(browser.requests.at(-1), {
    url: "blob:fixture",
    filename: "plan.md",
    conflictAction: "uniquify",
  });
  browser.update(id, { filename: "/d/plan.md", state: "complete" });
  assert.match((await saving).text, /plan\.md: completed/);
  browser.add({ filename: "/d/user.pdf", state: "complete" });
  const list = await tool({ action: "list" });
  assert.match(
    list.text,
    /^2 most recent downloads:\n#\d+ user\.pdf \(not started by you\): completed[^\n]*\n#\d+ plan\.md: completed/,
  );
  assert.equal(list.output.count, 2);
  assert.match((await tool({ action: "save" })).text, /Pass content/);
  assert.match(
    (await tool({ action: "save", source: "https://x.test/a.pdf" })).text,
    /use the download action/,
  );
  assert.match(
    (
      await tool(
        { action: "save", source: "art-404" },
        { readArtifact: async () => undefined },
      )
    ).text,
    /No stored output "art-404"/,
  );
  assert.match(
    (await tool({ action: "explode" })).text,
    /action must be one of/,
  );
});

test("without a downloads API every action says so instead of failing", async () => {
  installBrowser();
  for (const action of ["download", "list", "wait"]) {
    const result = await tool({ action, url: "https://x.test/a.pdf" });
    assert.equal(result.isError, true);
    assert.match(result.text, /does not let extensions download files/);
  }
  assert.deepEqual(await downloadsStartedSince({ chatId: "chat-a" }, 0), []);
});
