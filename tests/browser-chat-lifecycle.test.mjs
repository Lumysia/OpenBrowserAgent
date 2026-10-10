import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { build } from "esbuild";
import { launchExtension, poll } from "./chromium.mjs";
import { composerFixture } from "./browser-composer.mjs";
import { reply } from "./provider-fixtures.mjs";

test("late attachment uploads preserve availability across route and content changes", async () => {
  const objects = new Map();
  const held = new Map();
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.method === "MKCOL") return response.writeHead(201).end();
    if (request.method === "PUT") {
      objects.set(request.url, Buffer.concat(chunks));
      if (
        request.url.endsWith(".txt") &&
        Buffer.concat(chunks).toString() === "original"
      )
        held.set(request.url, response);
      else response.writeHead(201).end();
      return;
    }
    const body = objects.get(request.url);
    response.writeHead(body ? 200 : 404).end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const bundle = await build({
      stdin: {
        contents: `export {writeSyncedChatAttachments,readSyncedChatAttachment} from "./src/shared/sync-chat-attachments";
        export {getAttachment,deleteAttachment} from "./src/shared/attachment-db";
        export {setActiveSyncBackend,setDataSync} from "./src/shared/storage-sync-settings";
        export {storage} from "./src/shared/storage";`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "iife",
      globalName: "lifecycle",
      write: false,
      platform: "browser",
    });
    browser = await launchExtension({ headed: false });
    const page = await browser.open(
      `chrome-extension://${browser.id}/options.html`,
    );
    const result = await page.send("Runtime.evaluate", {
      expression: bundle.outputFiles[0].text,
    });
    assert.equal(result.exceptionDetails, undefined);
    await page.call((url) => {
      globalThis.route = {
        id: "upload-route",
        name: "Fixture",
        type: "webdav",
        url,
      };
      // Observe the real message transport settling, without replacing storage,
      // HTTP, IndexedDB or any attachment implementation.
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      globalThis.pendingUploads = new Set();
      chrome.runtime.sendMessage = async (...args) => {
        if (args[0]?.operation !== "webDavWriteObject") return send(...args);
        pendingUploads.add(args[0]);
        try {
          return await send(...args);
        } finally {
          pendingUploads.delete(args[0]);
        }
      };
    }, `http://127.0.0.1:${server.address().port}/original/`);
    for (const change of [
      "unchanged",
      "disable",
      "switch",
      "config",
      "category",
      "newer",
    ]) {
      await page.call(async (id) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          "sync-backends": [
            route,
            {
              ...route,
              id: "other-route",
              url: route.url.replace("original", "other"),
            },
          ],
          "active-sync-backend-id": route.id,
          "sync-data-settings:sync-local-cache": {
            value: { syncChatAttachments: true },
            updatedAt: 1,
            flushedAt: 1,
          },
        });
        globalThis.attachment = {
          id,
          name: "note.txt",
          type: "text/plain",
          kind: "text",
          text: "original",
          size: 8,
        };
        await lifecycle.writeSyncedChatAttachments({
          chatId: "chat",
          messageId: "message",
          attachments: [attachment],
        });
      }, change);
      const path = await poll(() =>
        [...held.keys()].find((path) => path.includes(`-${change}-`)),
      );
      assert.equal(
        await page.call(
          async (id) =>
            (await lifecycle.readSyncedChatAttachment(undefined, id))?.text,
          change,
        ),
        "original",
      );
      await page.call(async (change) => {
        if (change === "disable") await lifecycle.setActiveSyncBackend("local");
        if (change === "switch")
          await lifecycle.setActiveSyncBackend("other-route");
        if (change === "config")
          await lifecycle.storage.syncBackends.set([
            { ...route, url: route.url.replace("original", "changed") },
          ]);
        if (change === "category")
          await lifecycle.setDataSync("syncChatAttachments", false);
        if (change === "newer")
          await lifecycle.writeSyncedChatAttachments({
            chatId: "chat",
            messageId: "new-message",
            attachments: [{ ...attachment, text: "newer", size: 5 }],
          });
      }, change);
      held.get(path).writeHead(201).end();
      await poll(() =>
        [...objects.keys()].some((path) => path.endsWith(`-${change}.json`)),
      );
      try {
        await poll(() => page.call(() => pendingUploads.size === 0));
      } catch (error) {
        assert.fail(
          `${change}: ${error.message}: ${JSON.stringify(await page.call(() => [...pendingUploads]))}`,
        );
      }
      const saved = await page.call(
        async (id) => ({
          local: !!(await lifecycle.getAttachment(id)),
          text: (await lifecycle.readSyncedChatAttachment(undefined, id))?.text,
        }),
        change,
      );
      assert.deepEqual(
        saved,
        { local: true, text: change === "newer" ? "newer" : "original" },
        change,
      );
      if (change === "unchanged") {
        assert.equal(
          await page.call(async (id) => {
            await lifecycle.deleteAttachment(id);
            return (await lifecycle.readSyncedChatAttachment(undefined, id))
              ?.text;
          }, change),
          "original",
          "remote fallback remains readable when local bytes are absent",
        );
      }
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("parent Close cancels unvisited retained and attached child streams before deletion", async () => {
  const connections = new Map();
  const fixture = await composerFixture((request, response) => {
    const content = request.body.messages.find(
      (message) => message.role === "user",
    ).content;
    const text = Array.isArray(content)
      ? content.map((part) => part.text || "").join("")
      : content;
    const id = text.match(/\b(detached|attached|unrelated)\b/)?.[1];
    assert.ok(id, "fixture chat marker must survive prompt context wrapping");
    const record = { closed: false };
    connections.set(id, record);
    response.on("close", () => {
      record.closed = true;
    });
    reply(response, request.protocol, { text: `Running ${id}`, end: false });
  });
  try {
    await fixture.configure();
    const owner = await fixture.browser.open(
      `chrome-extension://${fixture.browser.id}/options.html`,
    );
    await owner.call(async () => {
      const chats = [
        { id: "parent", title: "Close parent" },
        {
          id: "detached",
          title: "Detached child",
          parentChatId: "parent",
          kind: "subagent",
        },
        {
          id: "attached",
          title: "Attached child",
          parentChatId: "parent",
          kind: "subagent",
        },
        { id: "unrelated", title: "Unrelated" },
      ].map((chat) => ({
        ...chat,
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: `${chat.id}-answer`,
            role: "assistant",
            content: "",
            createdAt: 1,
            metadata: { runMetrics: { startedAt: Date.now() } },
          },
        ],
      }));
      await chrome.storage.local.set({ chats });
      globalThis.streamErrors = [];
      globalThis.ownedPorts = chats
        .filter((chat) => chat.id !== "parent")
        .map((chat) => {
          const port = chrome.runtime.connect({ name: "ai-stream" });
          port.onMessage.addListener((event) => {
            if (event.type === "error") streamErrors.push(event.error);
          });
          port.postMessage({
            type: "sendMessages",
            chatId: chat.id,
            messageId: `${chat.id}-answer`,
            messages: [
              { id: "user", role: "user", content: chat.id, createdAt: 1 },
            ],
            body: {
              modelId: "acceptance-model",
              language: "en",
              maxToolSteps: 3,
              agentCapabilities: {},
            },
          });
          return port;
        });
    });
    try {
      await poll(() => connections.size === 3);
    } catch (error) {
      assert.fail(
        `${error.message}: ${JSON.stringify({ requests: fixture.requests, errors: await owner.call(() => streamErrors) })}`,
      );
    }
    await owner.call(() => ownedPorts.forEach((port) => port.disconnect()));
    await fixture.page.send("Page.reload");
    await poll(() =>
      fixture.page.call(
        () => !!document.querySelector('[aria-label="Chat History"]'),
      ),
    );
    await fixture.page.call(() =>
      document.querySelector('[aria-label="Chat History"]').click(),
    );
    await poll(() =>
      fixture.page.call(
        () => document.querySelectorAll(".history-item").length === 4,
      ),
    );
    await fixture.page.call(() =>
      [...document.querySelectorAll(".history-item")]
        .find((item) => item.textContent.includes("Attached child"))
        .querySelector(".history-select")
        .click(),
    );
    try {
      await poll(() =>
        fixture.page.call(() =>
          document.body.textContent.includes("Running attached"),
        ),
      );
    } catch (error) {
      assert.fail(
        `${error.message}: ${JSON.stringify({ connections: [...connections], state: await fixture.page.call(async () => ({ text: document.body.textContent, chats: (await chrome.storage.local.get("chats")).chats })) })}`,
      );
    }
    await fixture.page.call(() =>
      document.querySelector('[aria-label="Chat History"]').click(),
    );
    await poll(() =>
      fixture.page.call(
        () => document.querySelectorAll(".history-item").length === 4,
      ),
    );
    // Hold the frontend acknowledgment after the real background has aborted.
    // The UI must retain chats until this promise resolves; a rejected response
    // must also leave them available for retry.
    await fixture.page.call(() => {
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      globalThis.closeRequest = null;
      globalThis.rejectClose = true;
      chrome.runtime.sendMessage = async (message, ...args) => {
        if (message.type !== "ai-stream.abort-chats")
          return send(message, ...args);
        closeRequest = message;
        if (rejectClose) return { ok: false, error: "Controlled rejection" };
        const response = await send(message, ...args);
        globalThis.backgroundAcknowledged = true;
        await new Promise((resolve) => {
          globalThis.releaseClose = resolve;
        });
        return response;
      };
    });
    const clickClose = () =>
      fixture.page.call(() =>
        [...document.querySelectorAll(".history-item")]
          .find((item) => item.textContent.includes("Close parent"))
          .querySelector('[aria-label="Remove chat"]')
          .click(),
      );
    await clickClose();
    await poll(() => fixture.page.call(() => !!closeRequest));
    assert.equal(
      await fixture.page.call(
        async () => (await chrome.storage.local.get("chats")).chats.length,
      ),
      4,
    );
    assert.equal(connections.get("detached").closed, false);
    await fixture.page.call(() => {
      rejectClose = false;
    });
    await poll(() =>
      fixture.page.call(
        () => !document.querySelector(".history-item.removing"),
      ),
    );
    await clickClose();
    await poll(() =>
      fixture.page.call(() => !!globalThis.backgroundAcknowledged),
    );
    await poll(
      () =>
        connections.get("detached").closed &&
        connections.get("attached").closed,
    );
    assert.equal(connections.get("unrelated").closed, false);
    assert.deepEqual(
      await fixture.page.call(() => closeRequest.chatIds.sort()),
      ["attached", "detached", "parent"],
    );
    assert.equal(
      await fixture.page.call(
        async () => (await chrome.storage.local.get("chats")).chats.length,
      ),
      4,
    );
    await fixture.page.call(() => releaseClose());
    await poll(() =>
      fixture.page.call(
        async () =>
          (await chrome.storage.local.get("chats")).chats.length === 1,
      ),
    );
    assert.deepEqual(
      await fixture.page.call(async () =>
        (await chrome.storage.local.get("chats")).chats.map((chat) => chat.id),
      ),
      ["unrelated"],
    );
    assert.equal(connections.get("unrelated").closed, false);
    await owner.call(() =>
      chrome.runtime.sendMessage({
        type: "ai-stream.abort-chats",
        chatIds: ["parent", "detached", "attached", "unrelated"],
      }),
    );
    await poll(() => connections.get("unrelated").closed);
  } finally {
    await fixture.close();
  }
});
