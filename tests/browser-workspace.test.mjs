import assert from "node:assert/strict";
import { test } from "node:test";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";

test(
  "production workspace editor preserves two agent runs, rejects stale drafts, and serializes cross-context saves",
  { timeout: 45000 },
  async () => {
    let startedRuns = 0;
    let releaseRuns;
    const bothRunsStarted = new Promise((resolve) => {
      releaseRuns = resolve;
    });
    const fixture = await providerFixture(async (request, response) => {
      const suffix = JSON.stringify(request.body).includes("Workspace run B")
        ? "b"
        : "a";
      const results = toolResults(request);
      if (!results.length) {
        if (++startedRuns === 2) releaseRuns();
        await bothRunsStarted;
      }
      reply(
        response,
        request.protocol,
        results.length >= 3
          ? { text: "Workspace changes stored." }
          : !results.length
            ? {
                calls: [
                  {
                    id: `load-${suffix}`,
                    name: "loadTools",
                    args: { names: ["manageMemory", "workspaceFiles"] },
                  },
                ],
              }
            : {
                calls: [
                  {
                    id: `memory-${suffix}`,
                    name: "manageMemory",
                    args: {
                      operation: "add",
                      text: `Memory from run ${suffix}`,
                    },
                  },
                  {
                    id: `file-${suffix}`,
                    name: "workspaceFiles",
                    args: {
                      operation: "write",
                      path: `run-${suffix}.md`,
                      content: `File from run ${suffix}`,
                    },
                  },
                ],
              },
      );
    });
    let browser;
    let stage = "launch";
    try {
      browser = await launchExtension({
        headed: process.env.OBA_HEADLESS !== "1",
      });
      const first = await browser.open(
        `chrome-extension://${browser.id}/options.html#/agents`,
      );
      await first.call(async (baseUrl) => {
        const now = Date.now();
        await chrome.storage.local.set({
          "active-sync-backend-id": "local",
          language: "en-US",
          provider: {
            fixture: {
              id: "fixture",
              type: "openai",
              baseUrl: `${baseUrl}/v1`,
              models: [{ id: "fixture-model", name: "fixture" }],
            },
          },
          agents: [
            {
              id: "fixture-agent",
              name: "Fixture agent",
              capabilities: {
                workspaceRead: true,
                workspaceWrite: true,
                memoryRead: true,
                memoryWrite: true,
              },
              createdAt: now,
              updatedAt: now,
            },
          ],
          "agent-workspaces": [
            {
              agentId: "fixture-agent",
              createdAt: now,
              updatedAt: now,
              files: [
                {
                  path: "NOTES.md",
                  content: "Original notes",
                  kind: "context",
                  updatedAt: now,
                },
                {
                  path: "other.md",
                  content: "Original other file",
                  kind: "context",
                  updatedAt: now,
                },
                {
                  path: "unrelated.md",
                  content: "Unrelated file to delete",
                  kind: "context",
                  updatedAt: now,
                },
              ],
            },
          ],
        });
      }, fixture.baseUrl);
      await first.send("Page.reload");
      const second = await browser.open(
        `chrome-extension://${browser.id}/options.html#/agents`,
      );
      stage = "open editor drafts";
      for (const page of [first, second]) await openWorkspace(page);
      await editFile(first, "NOTES.md", "Draft from first editor");
      await editFile(second, "NOTES.md", "Saved from second editor");

      stage = "concurrent background workspace and memory tools";
      for (const [page, suffix] of [
        [first, "A"],
        [second, "B"],
      ]) {
        await page.call((suffix) => {
          const port = chrome.runtime.connect({ name: "ai-stream" });
          globalThis.__obaWorkspaceRun = {
            ended: false,
            errors: 0,
            outputs: 0,
          };
          port.onMessage.addListener((event) => {
            if (event.type === "error") __obaWorkspaceRun.errors++;
            if (event.chunk?.state === "output-available")
              __obaWorkspaceRun.outputs++;
            if (event.type === "end" || event.type === "error") {
              __obaWorkspaceRun.ended = true;
              port.disconnect();
            }
          });
          const capabilities = {
            browserTools: true,
            deferredBrowserTools: true,
            workspaceRead: true,
            workspaceWrite: true,
            memoryRead: true,
            memoryWrite: true,
          };
          port.postMessage({
            type: "sendMessages",
            chatId: `workspace-${suffix}`,
            messageId: `answer-${suffix}`,
            messages: [
              {
                id: `question-${suffix}`,
                role: "user",
                content: `Workspace run ${suffix}`,
                createdAt: Date.now(),
              },
            ],
            body: {
              modelId: "fixture-model",
              language: "en-US",
              maxToolSteps: 3,
              agentCapabilities: capabilities,
              context: {
                agent: {
                  id: "fixture-agent",
                  name: "Fixture agent",
                  capabilities,
                  createdAt: 1,
                  updatedAt: 1,
                },
              },
            },
          });
        }, suffix);
      }
      for (const page of [first, second]) {
        const result = await poll(() =>
          page.call(() =>
            __obaWorkspaceRun.ended ? __obaWorkspaceRun : undefined,
          ),
        );
        assert.equal(result.errors, 0);
        assert.equal(result.outputs, 3);
      }
      await assertRunData(first);
      stage = "save with newer unrelated data";
      await saveFile(second, "NOTES.md");
      await waitForFile(first, "NOTES.md", "Saved from second editor");
      await assertRunData(first);
      stage = "reject changed same-file draft";
      await saveFile(first, "NOTES.md");
      await poll(() =>
        first.call(() =>
          document.body.textContent.includes(
            "This file changed while you were editing.",
          ),
        ),
      );
      assert.equal(
        await first.call(
          () => document.querySelector(".option-file-editor textarea").value,
        ),
        "Draft from first editor",
      );
      await waitForFile(first, "NOTES.md", "Saved from second editor");

      stage =
        "unrelated deletion must preserve the open draft conflict baseline";
      await first.call(() =>
        [...document.querySelectorAll(".option-file-block")]
          .find(
            (node) =>
              node.querySelector(".option-file-name")?.textContent ===
              "unrelated.md",
          )
          .querySelector('button[aria-label="Delete"]')
          .click(),
      );
      await poll(() =>
        first.call(async () => {
          const values = await chrome.storage.local.get("agent-workspaces");
          return !values["agent-workspaces"]
            .find((item) => item.agentId === "fixture-agent")
            .files.some((file) => file.path === "unrelated.md");
        }),
      );
      await waitForFile(first, "NOTES.md", "Saved from second editor");
      await saveFile(first, "NOTES.md");
      await poll(() =>
        first.call(() =>
          document.body.textContent.includes(
            "This file changed while you were editing.",
          ),
        ),
      );
      assert.equal(
        await first.call(
          () => document.querySelector(".option-file-editor textarea").value,
        ),
        "Draft from first editor",
      );
      await waitForFile(first, "NOTES.md", "Saved from second editor");

      stage = "queue saves from separate contexts behind Web Lock";
      await toggleEdit(first, "NOTES.md");
      await editFile(first, "NOTES.md", "First context save");
      await editFile(second, "other.md", "Second context save");
      await first.call(() => {
        globalThis.__obaHoldingLock = false;
        globalThis.__obaLockDone = navigator.locks.request(
          "openbrowseragent:storage-mutation",
          () =>
            new Promise((resolve) => {
              __obaHoldingLock = true;
              globalThis.__obaReleaseLock = resolve;
            }),
        );
      });
      await poll(() => first.call(() => __obaHoldingLock));
      await saveFile(first, "NOTES.md");
      await saveFile(second, "other.md");
      const pending = await poll(() =>
        first.call(async () => {
          const state = await navigator.locks.query();
          const waiting = state.pending.filter(
            (lock) => lock.name === "openbrowseragent:storage-mutation",
          );
          const clients = new Set(waiting.map((lock) => lock.clientId));
          return clients.size >= 2 ? clients.size : undefined;
        }),
      );
      assert.equal(
        pending,
        2,
        "independent page clients must use the same shared mutation lock",
      );
      await waitForFile(first, "NOTES.md", "Saved from second editor");
      await waitForFile(first, "other.md", "Original other file");
      // Keep the previous save pending, then open and type into another draft.
      // Its eventual completion must not close or replace the new editor.
      await editFile(
        first,
        "run-a.md",
        "New draft while previous save is pending",
      );
      await first.call(async () => {
        __obaReleaseLock();
        await __obaLockDone;
      });
      stage = "verify both serialized writes and earlier agent data";
      await waitForFile(first, "NOTES.md", "First context save");
      await waitForFile(first, "other.md", "Second context save");
      await assertRunData(first);
      assert.equal(
        await first.call(
          () => document.querySelector(".option-file-editor textarea")?.value,
        ),
        "New draft while previous save is pending",
      );
    } catch (error) {
      throw new Error(`Workspace fixture stage: ${stage}`, { cause: error });
    } finally {
      await browser?.close();
      await fixture.close();
    }
  },
);

async function openWorkspace(page) {
  await poll(() =>
    page.call(() =>
      [...document.querySelectorAll("[aria-expanded]")].some((node) =>
        node.textContent.includes("Fixture agent"),
      ),
    ),
  );
  await page.call(() =>
    [...document.querySelectorAll('[aria-expanded="false"]')]
      .find((node) => node.textContent.includes("Fixture agent"))
      ?.click(),
  );
  await poll(() =>
    page.call(() =>
      [...document.querySelectorAll('[aria-expanded="false"]')].some((node) =>
        node.textContent.includes("Agent workspace"),
      ),
    ),
  );
  await page.call(() =>
    [...document.querySelectorAll('[aria-expanded="false"]')]
      .find((node) => node.textContent.includes("Agent workspace"))
      ?.click(),
  );
  await poll(() =>
    page.call(
      () => document.querySelectorAll(".option-file-block").length >= 6,
    ),
  );
}

async function toggleEdit(page, path) {
  await page.call(
    (path) =>
      [...document.querySelectorAll(".option-file-block")]
        .find(
          (node) =>
            node.querySelector(".option-file-name")?.textContent === path,
        )
        .querySelector('button[aria-label="Edit"]')
        .click(),
    path,
  );
}

async function editFile(page, path, content) {
  await toggleEdit(page, path);
  await poll(() =>
    page.call(() => !!document.querySelector(".option-file-editor textarea")),
  );
  await page.send("Page.bringToFront");
  await page.call(() => {
    const input = document.querySelector(".option-file-editor textarea");
    input.focus();
    input.select();
  });
  await page.send("Input.insertText", { text: content });
}

async function saveFile(page, path) {
  await page.call(
    (path) =>
      [...document.querySelectorAll(".option-file-block")]
        .find(
          (node) =>
            node.querySelector(".option-file-name")?.textContent === path,
        )
        .querySelector(".option-file-editor button")
        .click(),
    path,
  );
}

async function waitForFile(page, path, content) {
  await poll(() =>
    page.call(
      async ({ path, content }) => {
        const values = await chrome.storage.local.get("agent-workspaces");
        return values["agent-workspaces"]
          .find((item) => item.agentId === "fixture-agent")
          ?.files.some(
            (file) => file.path === path && file.content === content,
          );
      },
      { path, content },
    ),
  );
}

async function assertRunData(page) {
  const files = await page.call(async () => {
    const values = await chrome.storage.local.get("agent-workspaces");
    return values["agent-workspaces"].find(
      (item) => item.agentId === "fixture-agent",
    ).files;
  });
  for (const suffix of ["a", "b"]) {
    assert.equal(
      files.find((file) => file.path === `run-${suffix}.md`)?.content,
      `File from run ${suffix}`,
    );
    assert.match(
      files.find((file) => file.path === "MEMORY.md")?.content || "",
      new RegExp(`Memory from run ${suffix}`),
    );
  }
}
