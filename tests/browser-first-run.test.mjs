import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { enUS } from "../src/shared/locales/en-US.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";

// First run: installing opens the setup page with the AI provider first, and
// the side panel's setup card offers adding a provider, with joining sync
// behind a link.

const t = enUS;

const texts = (page, selector) =>
  page.call(
    (selector) =>
      [...document.querySelectorAll(selector)].map((element) =>
        element.textContent.trim(),
      ),
    selector,
  );

test(
  "first run: the setup page opens on install; the side panel card",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension({ keepWelcome: true });
    try {
      const welcomeUrl = `chrome-extension://${browser.id}/options.html${OPTIONS_HASH.welcome}`;
      await poll(async () =>
        (await browser.targets()).some((target) => target.url === welcomeUrl),
      );
      const setup = await browser.attach((url) => url === welcomeUrl);
      await setup.call(
        (key) => chrome.storage.local.set({ [key]: "en-US" }),
        STORAGE_KEYS.language,
      );
      await poll(async () =>
        (await texts(setup, "h1")).includes(t.setup.welcomeTitle),
      );
      // The provider comes first; the sync code is behind the link.
      const buttons = await texts(setup, "button");
      assert.ok(buttons.includes(t.sidepanel.addProvider), buttons.join("|"));
      assert.ok(buttons.includes(t.setup.joinLink), buttons.join("|"));
      assert.equal(
        await setup.call(() => !!document.querySelector("textarea")),
        false,
      );
      // Named services are added from the list; the Responses API is an
      // API style of OpenAI, not a list entry.
      await clickElement(setup, '.provider-add-row [role="combobox"]');
      await poll(
        async () => (await texts(setup, '[role="option"]')).length > 0,
      );
      const types = await texts(setup, '[role="option"]');
      for (const name of [
        t.display.providerTypes.openai,
        t.display.providerTypes.anthropic,
        "DeepSeek",
        "OpenRouter",
      ])
        assert.ok(types.includes(name), `${name} in ${types.join("|")}`);
      assert.equal(
        types.includes(t.display.providerTypes["openai-responses"]),
        false,
      );
      await clickElement(setup, '[role="option"]', { text: "DeepSeek" });
      await clickElement(setup, ".provider-add-row button", {
        text: t.sidepanel.addProvider,
      });
      const stored = await poll(() =>
        setup.call(
          async (key) => (await chrome.storage.local.get(key))[key]?.deepseek,
          STORAGE_KEYS.provider,
        ),
      );
      assert.equal(stored.baseUrl, "https://api.deepseek.com/v1");
      // The base URL is under Advanced.
      const baseUrlShown = () =>
        setup.call(
          (label) =>
            [...document.querySelectorAll("label")].some((item) =>
              item.textContent.startsWith(label),
            ),
          t.options.baseUrl,
        );
      assert.equal(await baseUrlShown(), false);
      await clickElement(setup, ".ui-disclosure-trigger", {
        text: t.options.advanced,
      });
      await poll(baseUrlShown);
      // Not listed in the sidebar.
      assert.equal(
        (await texts(setup, ".nav-link")).includes(t.setup.welcomeTitle),
        false,
      );

      const panel = await browser.open(
        `chrome-extension://${browser.id}/sidepanel.html`,
      );
      await poll(async () =>
        (await texts(panel, ".setup-card .ui-card-title")).includes(
          t.setup.title,
        ),
      );
      const steps = await texts(panel, ".setup-card button");
      assert.deepEqual(steps, [t.sidepanel.addProvider, t.setup.joinLink]);
      // No language picker on the card any more.
      assert.equal(
        await panel.call(
          () => !!document.querySelector('.setup-card [role="combobox"]'),
        ),
        false,
      );
      await clickElement(panel, "button", { text: t.setup.joinLink });
      await poll(() =>
        panel.call(() => !!document.querySelector(".setup-card textarea")),
      );
      const tabs = await texts(panel, '.setup-card [role="tab"]');
      assert.deepEqual(tabs, [t.setup.codeTab, t.setup.manualTab]);
    } finally {
      await browser.close();
    }
  },
);
