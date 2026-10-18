import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { PAGE_TRANSLATE_ENGINE } from "../src/shared/page-translate/settings.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { formatMessage } from "../src/shared/text.ts";
import {
  BROWSER_TEST_TIMEOUT,
  fixtureProvider,
  startExtension,
  unchangedFor,
} from "./browser-harness.mjs";
import { click, elementCenter, hoverTooltip, pressKey } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

const t = getMessages("en-US");
const TRIGGER = `.models-table [aria-label="${t.settings.modelTranslation}"]`;
const MODELS = [
  { id: "fixture-alpha", name: "fixture-alpha" },
  { id: "fixture-beta", name: "fixture-beta" },
];

// The Models table's Translation row: chosen with the AI engine only; with
// the built-in translator or a free service the model is never used, so
// the row says why instead of taking a choice, and keeps the stored one.
test(
  "Models table: the Translation model follows the page translation engine",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension({
      storage: (baseUrl) => ({
        [STORAGE_KEYS.language]: "en-US",
        [STORAGE_KEYS.provider]: {
          fixture: fixtureProvider(baseUrl, { models: MODELS }),
        },
        [STORAGE_KEYS.preferences]: {
          colorScheme: "light",
          pageTranslate: {
            engine: PAGE_TRANSLATE_ENGINE.google,
            modelId: MODELS[1].id,
          },
        },
      }),
    });
    const { options, extensionUrl, setPreferences } = session;
    const row = () =>
      options.call((selector) => {
        const trigger = document.querySelector(selector);
        if (!trigger) return null;
        return {
          unavailable: trigger.getAttribute("aria-disabled") === "true",
          disabled: trigger.disabled,
          value: trigger.textContent,
          description: trigger
            .closest(".settings-toggle-row")
            .querySelector(".ui-card-description")?.textContent,
        };
      }, TRIGGER);
    const storedModelId = () =>
      options.call(
        async (key) =>
          (await chrome.storage.local.get(key))[key].pageTranslate.modelId,
        STORAGE_KEYS.preferences,
      );
    const listOpen = () =>
      options.call(() => !!document.querySelector('[role="listbox"]'));
    const setEngine = (engine) =>
      setPreferences({ pageTranslate: { engine, modelId: MODELS[1].id } });
    const unavailableFor = (engine) =>
      formatMessage(t.settings.modelTranslationUnavailable, {
        engine: t.pageTranslate.engineNames[engine],
      });
    const unavailable = unavailableFor(PAGE_TRANSLATE_ENGINE.google);
    // Not editable, the stored model still shown, the engine's reason on
    // hover.
    const assertUnavailable = async (engine) => {
      await poll(async () => (await row()).unavailable);
      assert.deepEqual(await row(), {
        unavailable: true,
        disabled: false,
        value: MODELS[1].name,
        description: t.pageTranslate.modelDescription,
      });
      await options.call(() => document.activeElement?.blur());
      const point = await elementCenter(options, TRIGGER);
      // Polled: the row may still show the last engine's reason.
      const expected = unavailableFor(engine);
      const shown = await poll(async () => {
        const text = await hoverTooltip(options, point);
        return text === expected ? text : null;
      });
      assert.equal(shown, expected);
      return point;
    };
    try {
      await options.send("Page.navigate", {
        url: extensionUrl(`options.html${OPTIONS_HASH.providers}`),
      });
      await poll(row);

      const point = await assertUnavailable(PAGE_TRANSLATE_ENGINE.google);
      await click(options, point);
      assert.equal(await unchangedFor(listOpen), false);

      // And on keyboard focus; the keys that open a select or pick by
      // typing do nothing.
      await options.call(() => document.activeElement?.blur());
      await options.call(
        (selector) => document.querySelector(selector).focus(),
        `.models-table [aria-label="${t.settings.modelSmartBar}"]`,
      );
      await pressKey(options, "Tab");
      assert.equal(
        await poll(() =>
          options.call(
            () => document.querySelector('[role="tooltip"]')?.textContent,
          ),
        ),
        unavailable,
      );
      assert.ok(
        await options.call(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          TRIGGER,
        ),
      );
      for (const key of ["ArrowDown", "Enter", " ", "f"])
        await pressKey(options, key);
      assert.equal(await unchangedFor(listOpen), false);
      assert.equal(await storedModelId(), MODELS[1].id);

      // The AI engine, chosen on the page translation settings: the row
      // takes a choice again, with the stored model.
      await setEngine(PAGE_TRANSLATE_ENGINE.model);
      await poll(async () => !(await row()).unavailable);
      assert.deepEqual(await row(), {
        unavailable: false,
        disabled: false,
        value: MODELS[1].name,
        description: t.pageTranslate.modelDescription,
      });
      await click(options, await elementCenter(options, TRIGGER));
      await poll(listOpen);
      await pressKey(options, "Escape");

      // The built-in translator and Microsoft never use the model either.
      for (const engine of [
        PAGE_TRANSLATE_ENGINE.browser,
        PAGE_TRANSLATE_ENGINE.microsoft,
      ]) {
        await setEngine(engine);
        await assertUnavailable(engine);
        assert.equal(await unchangedFor(listOpen), false);
      }
      assert.equal(await storedModelId(), MODELS[1].id);
    } finally {
      await session.close();
    }
  },
);
