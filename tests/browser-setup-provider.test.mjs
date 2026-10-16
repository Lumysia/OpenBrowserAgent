import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";

// Picking a kind on setup's AI provider step adds that provider. Setup
// going elsewhere without it (Back and the returning path, Skip) deletes
// it while nothing is filled in; one with a key stays.

const t = getMessages("en-US");
const TYPE = "openai";

const heading = (page) =>
  page.call(() => document.querySelector(".setup-step h1")?.textContent);

async function atStep(page, title) {
  try {
    await poll(async () => (await heading(page)) === title);
  } catch {
    throw new Error(`Expected step "${title}", saw "${await heading(page)}"`);
  }
}

const storedProviders = (page) =>
  page.call(
    async (key) => (await chrome.storage.local.get(key))[key] ?? {},
    STORAGE_KEYS.provider,
  );

const progressProviderId = (page) =>
  page.call(
    async (key) => (await chrome.storage.session.get(key))[key]?.providerId,
    STORAGE_KEYS.setupProgress,
  );

async function newUserProviderStep(page) {
  await clickElement(page, ".ui-choice-card", { text: t.setup.pathNew });
  await atStep(page, t.setup.providerTitle);
}

async function pickType(page) {
  await clickElement(
    page,
    `[role="combobox"][aria-label="${t.options.providers}"]`,
  );
  await clickElement(page, '[role="option"]', {
    text: t.display.providerTypes[TYPE],
    exact: true,
  });
  await poll(async () => !!(await storedProviders(page))[TYPE]);
}

const back = (page) => clickElement(page, "button", { text: t.setup.back });

test(
  "setup: an AI provider left empty goes when setup moves on without it; one filled in stays",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension({ keepWelcome: true });
    try {
      const url = `chrome-extension://${browser.id}/options.html${OPTIONS_HASH.welcome}`;
      await poll(async () =>
        (await browser.targets()).some((target) => target.url === url),
      );
      const setup = await browser.attach((target) => target === url);
      await setup.send("Page.bringToFront");
      await setup.call(
        (key) => chrome.storage.local.set({ [key]: "en-US" }),
        STORAGE_KEYS.language,
      );
      await atStep(setup, t.setup.languageTitle);
      await clickElement(setup, ".setup-forward");
      await atStep(setup, t.setup.pathTitle);

      // Picked, then Back and the returning path: gone.
      await newUserProviderStep(setup);
      await pickType(setup);
      assert.equal(await progressProviderId(setup), TYPE);
      await back(setup);
      await atStep(setup, t.setup.pathTitle);
      await poll(async () => !(await storedProviders(setup))[TYPE]);
      await poll(async () => (await progressProviderId(setup)) === undefined);
      await clickElement(setup, ".ui-choice-card", {
        text: t.setup.pathReturning,
      });
      await atStep(setup, t.setup.syncTitle);
      assert.deepEqual(await storedProviders(setup), {});

      // Picked, then Skip: gone, and the step starts empty again.
      await back(setup);
      await atStep(setup, t.setup.pathTitle);
      await newUserProviderStep(setup);
      await pickType(setup);
      await clickElement(setup, ".setup-forward", { text: t.setup.skipStep });
      await atStep(setup, t.setup.pagesTitle);
      await poll(async () => !(await storedProviders(setup))[TYPE]);
      await back(setup);
      await atStep(setup, t.setup.providerTitle);
      assert.equal(
        await setup.call(
          () => !!document.querySelector('input[type="password"]'),
        ),
        false,
      );

      // A key typed (and allowed to be sent): it stays, on any path.
      await pickType(setup);
      await typeText(setup, "sk-setup", 'input[type="password"]');
      await setup.call(() =>
        document.querySelector(".ui-checkbox input").click(),
      );
      await poll(
        async () => (await storedProviders(setup))[TYPE]?.apiKey === "sk-setup",
      );
      await back(setup);
      await atStep(setup, t.setup.pathTitle);
      await poll(async () => (await progressProviderId(setup)) === undefined);
      await clickElement(setup, ".ui-choice-card", {
        text: t.setup.pathReturning,
      });
      await atStep(setup, t.setup.syncTitle);
      assert.equal((await storedProviders(setup))[TYPE]?.apiKey, "sk-setup");
    } finally {
      await browser.close();
    }
  },
);
