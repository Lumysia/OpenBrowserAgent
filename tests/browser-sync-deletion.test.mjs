import assert from "node:assert/strict";
import { test } from "node:test";
import { launchExtension, poll } from "./chromium.mjs";

test(
  "deleting the final synced provider stays empty after flush, reload and remote refresh",
  { timeout: 60000 },
  async () => {
    const browser = await launchExtension({
      headed: process.env.OBA_HEADLESS !== "1",
    });
    try {
      const page = await browser.open(
        `chrome-extension://${browser.id}/options.html#/providers`,
      );
      await page.call(async () => {
        const backendConfig = {
          id: "browser-sync",
          type: "browser-sync",
          name: "Fixture",
        };
        const settings = {
          syncProviders: true,
          syncChats: false,
          syncAgents: false,
          syncSkills: false,
          syncMcpServers: false,
          syncLocalExecutionBridges: false,
          syncChatAttachments: false,
        };
        const provider = {
          only: {
            id: "only",
            type: "openai",
            label: "Final provider fixture",
            models: [],
          },
        };
        for (const [key, value] of Object.entries({
          language: "en-US",
          "sync-data-settings": settings,
          provider,
        })) {
          const response = await chrome.runtime.sendMessage({
            type: "sync-backend.request",
            backendConfig,
            operation: "write",
            key,
            value,
          });
          if (!response?.ok) throw new Error("Fixture setup failed");
        }
        const cache = (value) => ({ value, updatedAt: 1, flushedAt: 1 });
        await chrome.storage.local.set({
          "active-sync-backend-id": "browser-sync",
          "language:sync-local-cache": cache("en-US"),
          "sync-data-settings:sync-local-cache": cache(settings),
          "provider:sync-local-cache": cache(provider),
        });
      });
      await reload(page);
      await poll(() =>
        page.call(() => {
          const trigger = [
            ...document.querySelectorAll('[aria-expanded="false"]'),
          ].find((node) => node.textContent.includes("Final provider fixture"));
          if (!trigger) return false;
          trigger.click();
          return true;
        }),
      );
      await poll(() =>
        page.call(() => {
          const button = [...document.querySelectorAll("button")].find(
            (node) => node.textContent.trim() === "Delete provider",
          );
          if (!button) return false;
          button.click();
          return true;
        }),
      );
      // Wait for the actual staged deletion to finish flushing, not just for the
      // optimistic React render to hide the provider.
      const flushed = await poll(() =>
        page.call(async () => {
          const values = await chrome.storage.local.get([
            "provider:sync-local-cache",
            "sync-write-status",
          ]);
          const cache = values["provider:sync-local-cache"];
          return cache?.updatedAt > 1 &&
            cache.flushedAt &&
            values["sync-write-status"]?.pendingCount === 0
            ? {
                value: cache.value,
                error: values["sync-write-status"].lastError || "",
              }
            : undefined;
        }),
      );
      assert.deepEqual(flushed, { value: {}, error: "" });
      assert.deepEqual(await readRemoteProvider(page), {});
      await reload(page);
      await assertEmptyProviderUi(page);

      // Discard the derived caches and seed a stale visible snapshot. A fresh
      // options context must read the real encoded document through background
      // messaging and replace the stale snapshot during its startup refresh.
      await page.call(async () => {
        await chrome.storage.local.remove(
          "tinybase-sync-doc:browser-sync:provider",
        );
        await chrome.storage.local.set({
          "provider:sync-local-cache": {
            value: {
              stale: {
                id: "stale",
                type: "openai",
                label: "Stale provider fixture",
                models: [],
              },
            },
            updatedAt: 1,
            flushedAt: 1,
          },
        });
      });
      await reload(page);
      await poll(() =>
        page.call(async () => {
          const cache = (
            await chrome.storage.local.get("provider:sync-local-cache")
          )["provider:sync-local-cache"];
          return cache?.flushedAt && Object.keys(cache.value).length === 0;
        }),
      );
      await assertEmptyProviderUi(page);
      assert.deepEqual(await readRemoteProvider(page), {});

      // A whole-document removal has a different transport meaning from {}.
      // Both must leave the loaded settings UI usable, including defaults for
      // preferences (intentionally absent from this fixture's remote store).
      const removed = await page.call(() =>
        chrome.runtime.sendMessage({
          type: "sync-backend.request",
          backendConfig: {
            id: "browser-sync",
            type: "browser-sync",
            name: "Fixture",
          },
          operation: "remove",
          key: "provider",
        }),
      );
      assert.equal(removed?.ok, true);
      assert.equal(await readRemoteProvider(page), undefined);
      await poll(() =>
        page.call(
          async () =>
            !(await chrome.storage.local.get("provider:sync-local-cache"))[
              "provider:sync-local-cache"
            ],
        ),
      );
      await assertEmptyProviderUi(page);

      await page.call(() => {
        const add = [...document.querySelectorAll("button")].find(
          (node) => node.textContent.trim() === "Add Provider",
        );
        if (!add)
          throw new Error("Add Provider control is unavailable after removal");
        add.click();
      });
      const added = await poll(() =>
        page.call(async () => {
          const values = await chrome.storage.local.get([
            "provider:sync-local-cache",
            "sync-write-status",
          ]);
          const next = values["provider:sync-local-cache"];
          return next?.flushedAt &&
            Object.keys(next.value).length === 1 &&
            values["sync-write-status"]?.pendingCount === 0
            ? next.value
            : undefined;
        }),
      );
      assert.equal(added.only, undefined);
      assert.equal(added.stale, undefined);
      assert.deepEqual(await readRemoteProvider(page), added);
      await reload(page);
      await poll(() =>
        page.call(
          () =>
            document.querySelectorAll(".provider-trigger-title").length === 1,
        ),
      );
      assert.deepEqual(
        await page.call(
          async () =>
            (await chrome.storage.local.get("provider:sync-local-cache"))[
              "provider:sync-local-cache"
            ]?.value,
        ),
        added,
      );
      assert.deepEqual(await readRemoteProvider(page), added);
    } finally {
      await browser.close();
    }
  },
);

async function readRemoteProvider(page) {
  const response = await page.call(() =>
    chrome.runtime.sendMessage({
      type: "sync-backend.request",
      backendConfig: {
        id: "browser-sync",
        type: "browser-sync",
        name: "Fixture",
      },
      operation: "read",
      key: "provider",
    }),
  );
  assert.equal(response?.ok, true);
  return response.value;
}

async function assertEmptyProviderUi(page) {
  await poll(() =>
    page.call(
      () =>
        document.querySelector("h1")?.textContent.includes("Model Providers") &&
        !document.querySelector(".provider-trigger-title"),
    ),
  );
}

async function reload(page) {
  const previous = await page.call(() => performance.timeOrigin);
  await page.send("Page.reload");
  await poll(() =>
    page.call(
      (previous) =>
        performance.timeOrigin !== previous &&
        document.readyState === "complete",
      previous,
    ),
  );
}
