import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { modelNameDisplay } from "../src/ui/provider-display.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";
import { clickElement, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture } from "./provider-fixtures.ts";

// The Models table in Settings shows each feature's choice as the feature
// uses it: a choice naming no model it can use reads as its "none" label
// (images: Off), never as an empty select, and the Images row lists the
// image models too.

const t = getMessages("en-US");

const stored = (page, key) =>
  page.call(async (key) => (await chrome.storage.local.get(key))[key], key);

// What each row's select shows, by its label.
const rows = (page) =>
  page.call(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.models-table [role="combobox"]')].map(
        (select) => [
          select.getAttribute("aria-label"),
          select.textContent.trim(),
        ],
      ),
    ),
  );

async function rowsShow(page, expected) {
  try {
    await poll(async () => {
      const shown = await rows(page);
      return Object.entries(expected).every(
        ([label, text]) => shown[label] === text,
      );
    });
  } catch {
    assert.deepEqual(await rows(page), expected);
  }
}

const heading = (page) =>
  page.call(() => document.querySelector(".setup-step h1")?.textContent);

const atStep = (page, title) =>
  poll(async () => (await heading(page)) === title);

test(
  "models table: after the guided setup with its defaults, Images reads Off",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const MODEL = "fixture-model";
    const fixture = await providerFixture((request, response) => {
      if (request.url === "/v1/models")
        return response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ data: [{ id: MODEL }] }));
      response.writeHead(404).end();
    });
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
      await clickElement(setup, ".ui-choice-card", { text: t.setup.pathNew });
      await atStep(setup, t.setup.providerTitle);
      await clickElement(
        setup,
        `[role="combobox"][aria-label="${t.options.providers}"]`,
      );
      await clickElement(setup, '[role="option"]', {
        text: t.display.providerTypes.openai,
        exact: true,
      });
      await poll(() =>
        setup.call(() => !!document.querySelector('input[type="password"]')),
      );
      const baseUrlField = await setup.call((label) => {
        const field = [...document.querySelectorAll("label")]
          .find((item) => item.textContent.startsWith(label))
          .querySelector("input");
        field.id ||= "setup-base-url";
        field.select();
        return `#${field.id}`;
      }, t.options.baseUrl);
      await typeText(setup, `${fixture.baseUrl}/v1`, baseUrlField);
      await typeText(setup, "sk-test", 'input[type="password"]');
      await clickElement(setup, "button", { text: t.setup.testConnection });
      const model = await poll(
        async () =>
          (await stored(setup, STORAGE_KEYS.provider))?.openai?.models?.[0],
      );
      // On to the end with every default.
      await poll(async () =>
        setup.call(
          (next) =>
            document.querySelector(".setup-forward")?.textContent.trim() ===
            next,
          t.setup.next,
        ),
      );
      await clickElement(setup, ".setup-forward");
      await atStep(setup, t.setup.pagesTitle);
      await clickElement(setup, ".setup-forward");
      await atStep(setup, t.setup.doneTitle);

      await setup.send("Page.navigate", {
        url: `chrome-extension://${browser.id}/options.html${OPTIONS_HASH.providers}`,
      });
      await rowsShow(setup, {
        [t.settings.modelChat]: modelNameDisplay(model, t),
        [t.settings.modelHelper]: t.options.modelSameAsChat,
        [t.settings.modelSmartBar]: t.options.modelSameAsChat,
        [t.settings.modelTranslation]: t.options.modelSameAsChat,
        [t.settings.modelImages]: t.options.imageModelOff,
      });
    } finally {
      try {
        await browser.close();
      } finally {
        await fixture.close();
      }
    }
  },
);

test(
  "models table: a choice of no configured model reads as none; an image model shows; deleting a chosen model unsets it",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const chat = { id: "fixture:chat", name: "chat" };
    const image = { id: "fixture:image", name: "image" };
    const provider = (baseUrl) => ({
      fixture: {
        id: "fixture",
        type: "openai",
        label: "Local fixture",
        baseUrl: `${baseUrl}/v1`,
        apiKey: "local-key",
        models: [chat],
        imageModels: [image],
      },
    });
    const session = await startExtension({
      storage: (baseUrl) => ({
        language: "en-US",
        provider: provider(baseUrl),
      }),
    });
    const { options, extensionUrl } = session;
    // Opens the Models table with `preferences` stored.
    async function show(preferences) {
      await options.call((items) => chrome.storage.local.set(items), {
        [STORAGE_KEYS.preferences]: preferences,
      });
      await options.send("Page.navigate", {
        url: extensionUrl(`options.html${OPTIONS_HASH.providers}`),
      });
      await poll(() =>
        options.call(() => !!document.querySelector(".models-table")),
      );
    }
    try {
      // Ids of models no provider has: each row reads as its none label.
      await show({
        selectedModelId: "gone",
        helperModelId: "gone",
        smartBar: { modelId: "gone" },
        pageTranslate: { modelId: "gone" },
        selectedImageModelId: "gone",
      });
      await rowsShow(options, {
        [t.settings.modelChat]: t.options.selectModel,
        [t.settings.modelHelper]: t.options.modelSameAsChat,
        [t.settings.modelSmartBar]: t.options.modelSameAsChat,
        [t.settings.modelTranslation]: t.options.modelSameAsChat,
        [t.settings.modelImages]: t.options.imageModelOff,
      });

      // An image-only model, and a choice stored by the model's name.
      await show({
        selectedModelId: chat.name,
        selectedImageModelId: image.id,
      });
      await rowsShow(options, {
        [t.settings.modelChat]: modelNameDisplay(chat, t),
        [t.settings.modelImages]: modelNameDisplay(image, t),
      });

      // Images with a chat model, which is then deleted in its provider.
      await show({ selectedModelId: chat.id, selectedImageModelId: chat.id });
      await rowsShow(options, {
        [t.settings.modelImages]: modelNameDisplay(chat, t),
      });
      await options.call(
        ({ name, label }) => {
          const item = [
            ...document.querySelectorAll(".ui-accordion-item"),
          ].find((item) => item.textContent.includes(name));
          if (item.dataset.state !== "open")
            item.querySelector(".ui-accordion-trigger").click();
        },
        { name: "Local fixture" },
      );
      await poll(() =>
        options.call(
          (label) =>
            !!document.querySelector(
              `.model-row-actions [aria-label="${label}"]`,
            ),
          t.common.delete,
        ),
      );
      await options.call(
        (label) =>
          document
            .querySelector(`.model-row-actions [aria-label="${label}"]`)
            .click(),
        t.common.delete,
      );
      await poll(async () => {
        const preferences = await stored(options, STORAGE_KEYS.preferences);
        return (
          !preferences.selectedImageModelId && !preferences.selectedModelId
        );
      });
      await rowsShow(options, {
        [t.settings.modelImages]: t.options.imageModelOff,
      });
    } finally {
      await session.close();
    }
  },
);
