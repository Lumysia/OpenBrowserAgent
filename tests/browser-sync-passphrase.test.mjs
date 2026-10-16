import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { createAgentDraft } from "../src/shared/agents.ts";
import { formatCount, getMessages } from "../src/shared/i18n.ts";
import { STORAGE_KEYS, SYNC_GROUPS } from "../src/shared/storage-keys.ts";
import { SYNC_MESSAGE } from "../src/shared/sync/client.ts";
import { createSyncConfigCode } from "../src/shared/sync-config-code.ts";
import { BROWSER_TEST_TIMEOUT, fixtureProvider } from "./browser-harness.mjs";
import { submitComposer } from "./browser-composer.mjs";
import { clickElement, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture, reply } from "./provider-fixtures.ts";
import { webDavServer } from "./webdav-server.mjs";

// A second device takes setup's returning path with a sync code from a
// device that syncs its API keys sealed with a passphrase. It is asked for
// the passphrase right after connecting; a wrong one says so. Skipped, setup
// shows what arrived, and Done opens the side panel and closes the setup
// tab. The side panel says the keys are locked (also when a chat would have
// used one) instead of sending a request without the key, and unlocks them
// there.

const t = getMessages("en-US");
const PASSPHRASE = "correct horse battery";
const API_KEY = "sk-synced-key";

const send = (page, message) =>
  page.call((message) => chrome.runtime.sendMessage(message), message);

const hasText = (page, text) =>
  page.call((text) => document.body.innerText.includes(text), text);

// The synced provider's API key as stored on the device.
const storedKey = (page) =>
  page.call(
    async (key) => (await chrome.storage.local.get(key))[key]?.fixture?.apiKey,
    STORAGE_KEYS.provider,
  );

// The primary buttons that can be pressed.
const primaryButtons = (page) =>
  page.call(() =>
    [
      ...document.querySelectorAll("button.ui-button-default:not(:disabled)"),
    ].map((button) => button.textContent.trim()),
  );

const heading = (page) =>
  page.call(() => document.querySelector(".setup-step h1")?.textContent);

async function atStep(page, title, timeout) {
  try {
    await poll(async () => (await heading(page)) === title, timeout);
  } catch {
    throw new Error(`Expected step "${title}", saw "${await heading(page)}"`);
  }
}

const stepDots = (page) =>
  page.call(() =>
    [...document.querySelectorAll(".ui-step-dot")].map(
      (dot) => dot.dataset.state,
    ),
  );

test(
  "returning path with a sync code: the passphrase is asked for at once, then what arrived, with no dead ends",
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
          [STORAGE_KEYS.agents]: [createAgentDraft("Helper")],
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

      // Setup's returning path on a new device, a sync code, and the
      // passphrase step that follows by itself.
      async function toPassphrase(device) {
        const setupUrl = `chrome-extension://${device.id}/options.html${OPTIONS_HASH.welcome}`;
        const setup = await device.attach((url) => url === setupUrl);
        await setup.send("Page.bringToFront");
        await setup.call(
          (key) => chrome.storage.local.set({ [key]: "en-US" }),
          STORAGE_KEYS.language,
        );
        await atStep(setup, t.setup.languageTitle);
        await clickElement(setup, ".setup-forward", { text: t.setup.next });
        await atStep(setup, t.setup.pathTitle);
        await clickElement(setup, ".ui-choice-card", {
          text: t.setup.pathReturning,
        });
        await atStep(setup, t.setup.syncTitle);
        // The sync code is the recommended way, chosen at first.
        assert.equal(
          await setup.call(
            () =>
              document.querySelector('.ui-choice-card[aria-pressed="true"]')
                ?.textContent,
          ),
          `${t.setup.methodCode}${t.setup.recommended}${t.setup.methodCodeDescription}`,
        );
        await typeText(
          setup,
          createSyncConfigCode({ backend, syncGroups: groups }),
          "textarea",
        );
        await clickElement(setup, "button", { text: t.setup.connect });
        // The keys are sealed: the passphrase step comes next.
        await atStep(setup, t.setup.passphraseTitle, 30000);
        assert.deepEqual(await stepDots(setup), [
          "complete",
          "complete",
          "complete",
          "current",
          "upcoming",
          "upcoming",
        ]);
        return { setup, setupUrl };
      }
      const arrived = (setup) =>
        poll(async () => {
          const rows = await setup.call(() =>
            [...document.querySelectorAll(".setup-arrived li")].map((row) =>
              row.textContent.trim(),
            ),
          );
          return (
            rows.join("|") ===
            [
              formatCount(t.setup.arrivedCount.providers, 1),
              formatCount(t.setup.arrivedCount.agents, 1),
            ].join("|")
          );
        }, 30000);

      // Device B: a wrong passphrase, then Skip.
      const deviceB = await launchExtension({ keepWelcome: true });
      try {
        const panelUrl = `chrome-extension://${deviceB.id}/sidepanel.html`;
        const { setup, setupUrl } = await toPassphrase(deviceB);
        const field = '.sync-unlock-form input[type="password"]';
        await typeText(setup, "not the passphrase", field);
        await clickElement(setup, "button", { text: t.setup.unlock });
        await poll(() => hasText(setup, t.sync.passphraseWrong));
        // The synced provider came without its key.
        assert.equal(await storedKey(setup), undefined);
        assert.equal(
          await setup.call(() =>
            document.querySelector(".setup-forward")?.textContent.trim(),
          ),
          t.setup.skipStep,
        );
        await clickElement(setup, ".setup-forward");

        // What arrived, by kind.
        await atStep(setup, t.setup.downloadTitle);
        await arrived(setup);
        assert.equal(await hasText(setup, t.setup.noSyncedProvider), false);
        await clickElement(setup, ".setup-forward", { text: t.setup.next });

        // Done: the side panel opens and the setup tab closes.
        await atStep(setup, t.setup.doneTitle);
        await clickElement(setup, "button", { text: t.setup.openPanel });
        await poll(async () => {
          const urls = (await deviceB.targets()).map((target) => target.url);
          return urls.includes(panelUrl) && !urls.includes(setupUrl);
        });

        // The side panel: the banner, and a chat says the key is locked
        // without sending anything.
        const panel = await deviceB.attach((url) => url === panelUrl);
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
        // The setup tab is gone: read it in the side panel.
        await poll(async () => (await storedKey(panel)) === API_KEY, 30000);
      } finally {
        await deviceB.close();
      }

      // Device C: the right passphrase. Each step goes on by itself, and
      // what arrived has one primary action left: Next.
      const deviceC = await launchExtension({ keepWelcome: true });
      try {
        const { setup } = await toPassphrase(deviceC);
        await typeText(
          setup,
          PASSPHRASE,
          '.sync-unlock-form input[type="password"]',
        );
        await clickElement(setup, "button", { text: t.setup.unlock });
        await atStep(setup, t.setup.downloadTitle, 30000);
        await arrived(setup);
        assert.deepEqual(await primaryButtons(setup), [t.setup.next]);
        await poll(async () => (await storedKey(setup)) === API_KEY, 30000);
        // Back shows the passphrase step as done, without connecting again.
        await clickElement(setup, "button", { text: t.setup.back });
        await atStep(setup, t.setup.passphraseTitle);
        await poll(() => hasText(setup, t.setup.keysUnlocked));
        assert.deepEqual(await primaryButtons(setup), [t.setup.next]);
      } finally {
        await deviceC.close();
      }
    } finally {
      await model.close();
      await dav.close();
    }
  },
);
