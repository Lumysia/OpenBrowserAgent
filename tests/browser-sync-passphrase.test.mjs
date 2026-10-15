import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { enUS } from "../src/shared/locales/en-US.ts";
import { STORAGE_KEYS, SYNC_GROUPS } from "../src/shared/storage-keys.ts";
import { SYNC_MESSAGE } from "../src/shared/sync/client.ts";
import { createSyncConfigCode } from "../src/shared/sync-config-code.ts";
import { BROWSER_TEST_TIMEOUT, fixtureProvider } from "./browser-harness.mjs";
import { submitComposer } from "./browser-composer.mjs";
import { clickElement, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture, reply } from "./provider-fixtures.ts";
import { webDavServer } from "./webdav-server.mjs";

// A second device joins sync with a sync code from a device that syncs its
// API keys sealed with a passphrase. It is asked for the passphrase right
// after connecting; a wrong one says so. Skipped, the side panel says the
// keys are locked (also when a chat would have used one) instead of
// sending a request without the key, and unlocks them there.

const t = enUS;
const PASSPHRASE = "correct horse battery";
const API_KEY = "sk-synced-key";

const send = (page, message) =>
  page.call((message) => chrome.runtime.sendMessage(message), message);

const buttonTexts = (page) =>
  page.call(() =>
    [...document.querySelectorAll("button")].map((button) =>
      button.textContent.trim(),
    ),
  );

const hasText = (page, text) =>
  page.call((text) => document.body.innerText.includes(text), text);

test(
  "sync code on a second device: the passphrase is asked for at once",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const dav = await webDavServer();
    const model = await providerFixture((request, response) =>
      request.headers.authorization === `Bearer ${API_KEY}`
        ? reply(response, request.protocol, { text: "Hello from B." })
        : response.writeHead(401).end('{"error":"key required"}'),
    );
    const backend = {
      id: "webdav",
      type: "webdav",
      name: "WebDAV",
      url: dav.url,
    };
    const groups = { [SYNC_GROUPS.keys]: true };
    try {
      // Device A: a provider with its key, keys synced with a passphrase.
      const deviceA = await launchExtension();
      try {
        const page = await deviceA.open(
          `chrome-extension://${deviceA.id}/options.html`,
        );
        await page.call((items) => chrome.storage.local.set(items), {
          [STORAGE_KEYS.provider]: {
            fixture: fixtureProvider(model.baseUrl, { apiKey: API_KEY }),
          },
          [STORAGE_KEYS.preferences]: { selectedModelId: "fixture" },
          [STORAGE_KEYS.syncBackends]: [backend],
          [STORAGE_KEYS.activeSyncBackendId]: backend.id,
        });
        assert.equal(
          (
            await send(page, {
              type: SYNC_MESSAGE.passphrase,
              passphrase: PASSPHRASE,
            })
          ).value,
          "set",
        );
        // Synced once the server's root holds the sealed key.
        await poll(async () => {
          await send(page, { type: SYNC_MESSAGE.now });
          return page.call(
            async (prefix) =>
              Object.entries(await chrome.storage.local.get(null)).some(
                ([key, state]) =>
                  key.startsWith(prefix) &&
                  Object.values(state.remote?.root.records ?? {}).some(
                    (record) => record.sealed,
                  ),
              ),
            `${STORAGE_KEYS.syncState}:`,
          );
        }, 30000);
      } finally {
        await deviceA.close();
      }

      // Device B: setup's AI provider step, a sync code, then the
      // passphrase.
      const deviceB = await launchExtension();
      try {
        const setup = await deviceB.open(
          `chrome-extension://${deviceB.id}/options.html${OPTIONS_HASH.welcome}`,
        );
        await setup.call(
          (key) => chrome.storage.local.set({ [key]: "en-US" }),
          STORAGE_KEYS.language,
        );
        // Setup's AI provider step offers the sync code.
        await clickElement(setup, ".setup-forward", { text: t.setup.next });
        await poll(async () =>
          (await buttonTexts(setup)).includes(t.setup.joinLink),
        );
        assert.equal(
          await setup.call(
            () => document.querySelector(".setup-step h1").textContent,
          ),
          t.setup.providerTitle,
        );
        await clickElement(setup, "button", { text: t.setup.joinLink });
        await poll(() =>
          setup.call(() => !!document.querySelector("textarea")),
        );
        await typeText(
          setup,
          createSyncConfigCode({ backend, syncGroups: groups }),
          "textarea",
        );
        await clickElement(setup, "button", { text: t.setup.connect });
        await poll(() => hasText(setup, t.setup.keysLocked), 30000);
        const field = '.sync-join-form input[type="password"]';
        await typeText(setup, "not the passphrase", field);
        await clickElement(setup, "button", { text: t.setup.unlock });
        await poll(() => hasText(setup, t.sync.passphraseWrong));
        // The synced provider came without its key.
        const storedKey = () =>
          setup.call(
            async (key) =>
              (await chrome.storage.local.get(key))[key]?.fixture?.apiKey,
            STORAGE_KEYS.provider,
          );
        assert.equal(await storedKey(), undefined);
        await clickElement(setup, "button", { text: t.setup.skip });
        await poll(() => hasText(setup, t.setup.connected));
        // The synced provider has a model: the step is done.
        await poll(async () =>
          (await buttonTexts(setup)).includes(t.setup.next),
        );

        // The side panel: the banner, and a chat says the key is locked
        // without sending anything.
        const panel = await deviceB.open(
          `chrome-extension://${deviceB.id}/sidepanel.html`,
        );
        await poll(() =>
          panel.call(() => !!document.querySelector(".sync-keys-banner")),
        );
        await submitComposer(panel, "Hello?");
        await poll(() => hasText(panel, t.display.errors.syncKeysLocked));
        assert.equal(model.requests.length, 0);
        assert.equal(await hasText(panel, "401"), false);

        await typeText(panel, PASSPHRASE, ".sync-keys-banner input");
        await clickElement(panel, ".sync-keys-banner button", {
          text: t.setup.unlock,
        });
        await poll(
          () => panel.call(() => !document.querySelector(".sync-keys-banner")),
          30000,
        );
        await poll(async () => (await storedKey()) === API_KEY, 30000);
      } finally {
        await deviceB.close();
      }
    } finally {
      await model.close();
      await dav.close();
    }
  },
);
