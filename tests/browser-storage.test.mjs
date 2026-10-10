import assert from "node:assert/strict";
import { test } from "node:test";
import { launchExtension, poll } from "./chromium.mjs";
import {
  composerFixture,
  typeComposer,
  sendComposer,
} from "./browser-composer.mjs";
import { reply } from "./provider-fixtures.mjs";

test(
  "settings migrate local data, roll back failure, survive refresh, and support named keyboard controls",
  { timeout: 60000 },
  async () => {
    const browser = await launchExtension({
      headed: process.env.OBA_HEADLESS !== "1",
    });
    try {
      const page = await browser.open(
        `chrome-extension://${browser.id}/options.html#/sync`,
      );
      await page.call(async () => {
        const backendConfig = {
          id: "browser-sync",
          type: "browser-sync",
          name: "Fixture",
        };
        const settings = {
          syncProviders: false,
          syncChats: false,
          syncAgents: false,
          syncSkills: false,
          syncMcpServers: false,
          syncLocalExecutionBridges: false,
          syncChatAttachments: false,
        };
        const provider = (id) => ({ [id]: { id, type: "openai", models: [] } });
        const chat = (id) => ({
          id,
          title: id,
          createdAt: 1,
          updatedAt: 1,
          messages: [
            { id: `${id}-message`, role: "user", content: id, createdAt: 1 },
          ],
        });
        for (const [key, value] of Object.entries({
          "sync-data-settings": settings,
          provider: provider("cloud"),
          chats: [chat("cloud-chat")],
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
        await chrome.storage.local.set({
          "active-sync-backend-id": "browser-sync",
          language: "en-US",
          "language:sync-local-cache": {
            value: "en-US",
            updatedAt: 1,
            flushedAt: 1,
          },
          "sync-data-settings:sync-local-cache": {
            value: settings,
            updatedAt: 1,
            flushedAt: 1,
          },
          provider: { ...provider("local-one"), ...provider("local-two") },
          chats: [chat("local-chat-one"), chat("local-chat-two")],
        });
      });
      await page.send("Page.reload");
      await poll(() =>
        page.call(() =>
          [...document.querySelectorAll("[aria-expanded]")].some((node) =>
            node.textContent.includes("Built-in browser account sync"),
          ),
        ),
      );
      await page.call(() =>
        [...document.querySelectorAll('[aria-expanded="false"]')]
          .find((node) =>
            node.textContent.includes("Built-in browser account sync"),
          )
          ?.click(),
      );
      await poll(() =>
        page.call(
          () =>
            !!document.querySelector(
              '[role="switch"][aria-label="Sync Providers"]',
            ),
        ),
      );
      await page.call(() => {
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        globalThis.__obaFailedMigration = false;
        chrome.runtime.sendMessage = (message, ...rest) => {
          if (
            message.type === "sync-backend.request" &&
            message.operation === "write" &&
            message.key === "provider" &&
            !globalThis.__obaFailedMigration
          ) {
            globalThis.__obaFailedMigration = true;
            return Promise.resolve({
              ok: false,
              error: "Fixture migration failure",
            });
          }
          return send(message, ...rest);
        };
        document
          .querySelector('[role="switch"][aria-label="Sync Providers"]')
          .click();
      });
      await poll(() =>
        page.call(
          () =>
            globalThis.__obaFailedMigration &&
            document
              .querySelector('[role="switch"][aria-label="Sync Providers"]')
              ?.getAttribute("aria-checked") === "false",
        ),
      );
      assert.deepEqual(
        await page.call(async () => {
          const values = await chrome.storage.local.get([
            "provider",
            "sync-data-settings:sync-local-cache",
          ]);
          return {
            ids: Object.keys(values.provider).sort(),
            enabled:
              values["sync-data-settings:sync-local-cache"].value.syncProviders,
          };
        }),
        { ids: ["local-one", "local-two"], enabled: false },
      );

      for (const [label, key, expected] of [
        ["Sync Providers", "provider", ["cloud", "local-one", "local-two"]],
        [
          "Sync Chats",
          "chats",
          ["cloud-chat", "local-chat-one", "local-chat-two"],
        ],
      ]) {
        await page.call(
          (label) =>
            document
              .querySelector(`[role="switch"][aria-label="${label}"]`)
              .click(),
          label,
        );
        const ids = await poll(() =>
          page.call(
            async ({ key, count }) => {
              const cache = (
                await chrome.storage.local.get(`${key}:sync-local-cache`)
              )[`${key}:sync-local-cache`];
              const ids =
                key === "chats"
                  ? cache?.value?.map((chat) => chat.id)
                  : Object.keys(cache?.value || {});
              return ids?.length === count ? ids.sort() : undefined;
            },
            { key, count: expected.length },
          ),
        );
        assert.deepEqual(ids, expected);
      }
      await page.send("Page.reload");
      await poll(() =>
        page.call(async () => {
          const values = await chrome.storage.local.get([
            "provider:sync-local-cache",
            "chats:sync-local-cache",
          ]);
          return (
            Object.keys(values["provider:sync-local-cache"]?.value || {})
              .length === 3 &&
            values["chats:sync-local-cache"]?.value?.length === 3
          );
        }),
      );
      // Disable from the actual settings control and verify the complete active
      // dataset is copied locally before its route changes.
      await poll(() =>
        page.call(() =>
          [...document.querySelectorAll("[aria-expanded]")].some((node) =>
            node.textContent.includes("Built-in browser account sync"),
          ),
        ),
      );
      await page.call(() =>
        [...document.querySelectorAll('[aria-expanded="false"]')]
          .find((node) =>
            node.textContent.includes("Built-in browser account sync"),
          )
          ?.click(),
      );
      for (const [label, key] of [
        ["Sync Providers", "provider"],
        ["Sync Chats", "chats"],
      ]) {
        await poll(() =>
          page.call(
            (label) =>
              !!document.querySelector(
                `[role="switch"][aria-label="${label}"]`,
              ),
            label,
          ),
        );
        await page.call(
          (label) =>
            document
              .querySelector(`[role="switch"][aria-label="${label}"]`)
              .click(),
          label,
        );
        await poll(() =>
          page.call(async (key) => {
            const value = (await chrome.storage.local.get(key))[key];
            return (
              (Array.isArray(value)
                ? value.length
                : Object.keys(value || {}).length) === 3
            );
          }, key),
        );
      }
      const general = await browser.open(
        `chrome-extension://${browser.id}/options.html#/general`,
      );
      await poll(() =>
        general.call(() => !!document.querySelector('input[type="radio"]')),
      );
      const { nodes } = await general.send("Accessibility.getFullAXTree");
      const controls = nodes.filter(
        (node) =>
          !node.ignored &&
          ["switch", "combobox", "spinbutton", "radio"].includes(
            node.role?.value,
          ),
      );
      assert.deepEqual(
        [...new Set(controls.map((node) => node.role.value))].sort(),
        ["combobox", "radio", "spinbutton", "switch"],
      );
      assert.deepEqual(
        controls.filter((node) => !node.name?.value),
        [],
        "settings controls need accessible names",
      );
      await general.call(() =>
        document.querySelector('input[type="radio"]:checked').focus(),
      );
      await general.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "ArrowRight",
        code: "ArrowRight",
        windowsVirtualKeyCode: 39,
      });
      await general.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "ArrowRight",
        code: "ArrowRight",
        windowsVirtualKeyCode: 39,
      });
      await poll(() =>
        general.call(() => document.documentElement.dataset.accent === "green"),
      );
      assert.equal(
        await general.call(() => document.activeElement.value),
        "green",
      );
      assert.notEqual(
        await general.call(
          () =>
            getComputedStyle(document.activeElement.closest("label"))
              .outlineStyle,
        ),
        "none",
        "keyboard focus must remain visible on the selected color",
      );
      const switchState = await general.call(() => {
        const control = document.querySelector('[role="switch"]');
        control.focus();
        return control.getAttribute("aria-checked");
      });
      await general.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      });
      await general.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      });
      await poll(() =>
        general.call(
          (before) =>
            document.activeElement.getAttribute("aria-checked") !== before,
          switchState,
        ),
      );
      await general.call(() =>
        document.querySelector('[role="combobox"]').focus(),
      );
      await general.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await poll(() =>
        general.call(() => !!document.querySelector('[role="listbox"]')),
      );
      await general.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await poll(() =>
        general.call(
          () =>
            !document.querySelector('[role="listbox"]') &&
            document.activeElement.getAttribute("role") === "combobox",
        ),
      );
    } finally {
      await browser.close();
    }
  },
);

for (const ordering of ["submit-before-load", "type-before-load"]) {
  test(
    `composer startup ${ordering} preserves input and persists before the model runs`,
    { timeout: 30000 },
    async () => {
      const fixture = await composerFixture((request, response) =>
        reply(response, request.protocol, {
          text: "Storage initialization answer.",
        }),
      );
      const { page } = fixture;
      try {
        await page.send("Page.enable");
        await page.send("Page.addScriptToEvaluateOnNewDocument", {
          source: `
        const get = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = (key) => {
          const result = get(key);
          if (key !== "chats" || globalThis.__obaChatLoadStarted) return result;
          globalThis.__obaChatLoadStarted = true;
          return result.then(value => new Promise(resolve => {
            globalThis.__obaReleaseChatLoad = () => resolve(value);
          }));
        };
      `,
        });
        await fixture.configure();
        await poll(() => page.call(() => !!globalThis.__obaReleaseChatLoad));
        const prompt = "Send before stored history is loaded.";
        await typeComposer(page, prompt);
        if (ordering === "submit-before-load") await sendComposer(page);
        // Give the old fire-and-forget path a chance to call the model while the
        // initial read is held. Only synthetic fixture requests are inspected.
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          fixture.requests.length,
          0,
          "No model request before the initial chat snapshot can persist",
        );
        await page.call(() => globalThis.__obaReleaseChatLoad());
        if (ordering === "type-before-load") {
          await page.call(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          assert.equal(
            await page.call(
              () => document.querySelector(".composer-box textarea")?.value,
            ),
            prompt,
            "unsent input must survive initial chat selection",
          );
          assert.equal(fixture.requests.length, 0);
          await sendComposer(page);
        }
        await poll(() =>
          page.call(() =>
            document
              .querySelector(".markdown")
              ?.textContent.includes("Storage initialization answer."),
          ),
        );
        const stored = await poll(() =>
          page.call(async () => {
            const { chats } = await chrome.storage.local.get("chats");
            const messages = chats
              .flatMap((chat) => chat.messages)
              .map((message) => ({
                role: message.role,
                content: message.content,
              }));
            return messages.some(
              (message) =>
                message.role === "assistant" &&
                message.content === "Storage initialization answer.",
            )
              ? messages
              : undefined;
          }),
        );
        assert.ok(
          stored.some(
            (message) =>
              message.role === "user" &&
              message.content === "Send before stored history is loaded.",
          ),
        );
        assert.equal(
          await page.call(
            () => document.querySelector(".composer-box textarea")?.value,
          ),
          "",
          "submitted input must clear without reappearing under the draft ID",
        );
      } finally {
        await fixture.close();
      }
    },
  );
}
