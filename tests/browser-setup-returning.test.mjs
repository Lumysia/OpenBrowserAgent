import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { SETUP_PATH_STEPS } from "../src/shared/setup-steps.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";
import { webDavServer } from "./webdav-server.mjs";

// Setup's returning path when sync doesn't work out: a server that can't
// be reached, then one that brings no AI provider. Each says so and offers
// trying again or going on as a new user, who lands on the AI provider
// step with the sync connection kept. The chosen path survives a reload,
// and Back goes from the first returning step to the question.

const t = getMessages("en-US");
const URL_FIELD = 'input[placeholder="https://example.com/dav/"]';

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

// The dots at `step` of `steps`.
const dotsAt = (steps, step) =>
  steps.map((item, index) => {
    const current = steps.indexOf(step);
    return index === current
      ? "current"
      : index < current
        ? "complete"
        : "upcoming";
  });

const hasText = (page, text) =>
  page.call((text) => document.body.innerText.includes(text), text);

const buttonTexts = (page) =>
  page.call(() =>
    [...document.querySelectorAll("button")].map((button) =>
      button.textContent.trim(),
    ),
  );

async function offersFallback(page, message) {
  await poll(() => hasText(page, message), 30000);
  const buttons = await buttonTexts(page);
  assert.ok(buttons.includes(t.setup.tryAgain), buttons.join("|"));
  assert.ok(buttons.includes(t.setup.asNewUser), buttons.join("|"));
}

async function typeUrl(page, url) {
  await page.call((selector) => {
    const field = document.querySelector(selector);
    field.focus();
    field.select();
  }, URL_FIELD);
  await typeText(page, url);
}

test(
  "returning path: a server that fails or brings no AI provider offers Try again or Set up as a new user",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const dav = await webDavServer();
    const gone = await webDavServer();
    await gone.close();
    const browser = await launchExtension({ keepWelcome: true });
    try {
      const setupUrl = `chrome-extension://${browser.id}/options.html${OPTIONS_HASH.welcome}`;
      let setup = await browser.attach((url) => url === setupUrl);
      await setup.send("Page.bringToFront");
      await setup.call(
        (key) => chrome.storage.local.set({ [key]: "en-US" }),
        STORAGE_KEYS.language,
      );
      await atStep(setup, t.setup.languageTitle);
      await clickElement(setup, ".setup-forward");
      await atStep(setup, t.setup.pathTitle);
      await clickElement(setup, ".ui-choice-card", {
        text: t.setup.pathReturning,
      });
      await atStep(setup, t.setup.syncTitle);
      // No passphrase step until the server has sealed keys.
      const returning = SETUP_PATH_STEPS.returning.filter(
        (step) => step !== "passphrase",
      );
      assert.deepEqual(await stepDots(setup), dotsAt(returning, "sync"));
      // No Skip here: Connect goes on.
      assert.equal(
        await setup.call(() => !!document.querySelector(".setup-forward")),
        false,
      );

      // Reloaded, setup goes on at the path chosen; Back goes to the
      // question, which remembers the answer.
      await setup.send("Page.reload");
      setup = await browser.attach((url) => url === setupUrl);
      await atStep(setup, t.setup.syncTitle);
      await clickElement(setup, "button", { text: t.setup.back });
      await atStep(setup, t.setup.pathTitle);
      assert.equal(
        await setup.call(
          () =>
            document.querySelector('.ui-choice-card[aria-pressed="true"]')
              ?.textContent,
        ),
        `${t.setup.pathReturning}${t.setup.pathReturningDescription}`,
      );
      await clickElement(setup, ".setup-forward", { text: t.setup.next });
      await atStep(setup, t.setup.syncTitle);

      // A WebDAV server that can't be reached, twice.
      await clickElement(setup, ".ui-choice-card", {
        text: t.sync.choiceWebDav,
      });
      await poll(() =>
        setup.call((selector) => !!document.querySelector(selector), URL_FIELD),
      );
      await typeUrl(setup, gone.url);
      await clickElement(setup, "button", { text: t.setup.connect });
      await offersFallback(setup, t.setup.failed);
      await clickElement(setup, "button", { text: t.setup.tryAgain });
      await offersFallback(setup, t.setup.failed);

      // One that answers but has nothing on it.
      await typeUrl(setup, dav.url);
      await clickElement(setup, "button", { text: t.setup.connect });
      await atStep(setup, t.setup.downloadTitle, 30000);
      await offersFallback(setup, t.setup.noSyncedProvider);
      assert.equal(
        await setup.call(() => !!document.querySelector(".setup-arrived")),
        false,
      );

      // Back on the sync step, connected: Next goes on, and connecting
      // again (with other details) is no longer the primary action.
      await clickElement(setup, "button", { text: t.setup.back });
      await atStep(setup, t.setup.syncTitle);
      await poll(() => hasText(setup, t.setup.connected));
      assert.deepEqual(
        await setup.call(() =>
          [
            ...document.querySelectorAll(
              "button.ui-button-default:not(:disabled)",
            ),
          ].map((button) => button.textContent.trim()),
        ),
        [t.setup.next],
      );
      await clickElement(setup, ".setup-forward", { text: t.setup.next });
      await atStep(setup, t.setup.downloadTitle);
      await offersFallback(setup, t.setup.noSyncedProvider);

      // As a new user: the AI provider step, with sync kept.
      await clickElement(setup, "button", { text: t.setup.asNewUser });
      await atStep(setup, t.setup.providerTitle);
      assert.deepEqual(
        await stepDots(setup),
        dotsAt(SETUP_PATH_STEPS.new, "provider"),
      );
      assert.equal(
        await setup.call(
          async (key) => (await chrome.storage.local.get(key))[key],
          STORAGE_KEYS.activeSyncBackendId,
        ),
        "webdav",
      );
    } finally {
      await browser.close();
      await dav.close();
    }
  },
);
