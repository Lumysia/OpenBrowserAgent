import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { SETUP_STEPS } from "../src/shared/setup-steps.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement, pressKey, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture, reply } from "./provider-fixtures.ts";

// First run: installing opens the guided setup at its first step. Each
// step is one thing (language, AI provider, on web pages, done) with Back
// and Next; every step can be skipped. Until setup is finished, whatever
// would open the side panel opens setup where it was left.

const t = getMessages("en-US");
const MODEL = "fixture-model";

const texts = (page, selector) =>
  page.call(
    (selector) =>
      [...document.querySelectorAll(selector)].map((element) =>
        element.textContent.trim(),
      ),
    selector,
  );

const heading = (page) =>
  page.call(() => document.querySelector(".setup-step h1")?.textContent);

async function atStep(page, title) {
  try {
    await poll(async () => (await heading(page)) === title);
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

const stored = (page, key) =>
  page.call(async (key) => (await chrome.storage.local.get(key))[key], key);

// The forward button: "Next" or "Skip".
const forward = (page) =>
  page.call(
    () => document.querySelector(".setup-forward")?.textContent.trim() ?? "",
  );

const clickForward = (page) => clickElement(page, ".setup-forward");

// Opens the select labelled `label` and picks `option`.
async function choose(page, label, option) {
  await clickElement(page, `[role="combobox"][aria-label="${label}"]`);
  await clickElement(page, '[role="option"]', { text: option, exact: true });
}

// The setup tab the extension opened on install, in English.
async function openedSetup(session) {
  const { browser, extensionUrl } = session;
  const url = extensionUrl(`options.html${OPTIONS_HASH.welcome}`);
  await poll(async () =>
    (await browser.targets()).some((target) => target.url === url),
  );
  const setup = await browser.attach((target) => target === url);
  // In front, as the tab the browser opened: a background tab runs no
  // animations, and controls wait for theirs to end.
  await setup.send("Page.bringToFront");
  await setup.call(
    (key) => chrome.storage.local.set({ [key]: "en-US" }),
    STORAGE_KEYS.language,
  );
  await atStep(setup, t.setup.languageTitle);
  return setup;
}

// The extension as just installed, with the setup tab it opened, and a
// fixture server answering `handle` (none: 404).
async function launch(
  handle = (_request, response) => response.writeHead(404).end(),
) {
  const fixture = await providerFixture(handle);
  const browser = await launchExtension({ keepWelcome: true }).catch(
    async (error) => {
      await fixture.close();
      throw error;
    },
  );
  return {
    browser,
    fixture,
    extensionUrl: (path) => `chrome-extension://${browser.id}/${path}`,
    async close() {
      try {
        await browser.close();
      } finally {
        await fixture.close();
      }
    },
  };
}

test(
  "first run: language, a compatible AI provider with its Base URL, page switches, then the side panel",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await launch((request, response) => {
      if (request.url === "/v1/models")
        return response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ data: [{ id: MODEL }] }));
      if (request.url === "/v1/chat/completions")
        return reply(response, request.protocol, { text: "OK" });
      response.writeHead(404).end();
    });
    const { browser, fixture, extensionUrl } = session;
    try {
      const setup = await openedSetup(session);
      // Step 1 of 4, in the sidebar-less setup page.
      assert.deepEqual(
        await stepDots(setup),
        SETUP_STEPS.map((_, index) => (index === 0 ? "current" : "upcoming")),
      );
      assert.equal(
        await setup.call(() => !!document.querySelector(".settings-sidebar")),
        false,
      );

      // A new language shows at once.
      const de = getMessages("de-DE");
      await choose(setup, t.common.language, "Deutsch");
      await atStep(setup, de.setup.languageTitle);
      await setup.call(
        (key) => chrome.storage.local.set({ [key]: "en-US" }),
        STORAGE_KEYS.language,
      );
      await atStep(setup, t.setup.languageTitle);

      // Enter means Next where it belongs to no control; the step's heading
      // takes the focus.
      await setup.call(() => document.querySelector(".setup-step h1").focus());
      await pressKey(setup, "Enter");
      await atStep(setup, t.setup.providerTitle);
      assert.equal(
        await setup.call(() => document.activeElement?.id),
        "setup-step",
      );
      assert.equal(await forward(setup), t.setup.skipStep);

      // A compatible server: its Base URL comes first, next to the API key.
      await choose(setup, t.options.providers, t.display.providerTypes.openai);
      const fields = () =>
        texts(setup, ".setup-provider-form label").then((labels) =>
          labels.map((label) => label.split("\n")[0]),
        );
      await poll(async () => (await fields()).includes(t.options.apiKey));
      const labels = await fields();
      assert.ok(
        labels.indexOf(t.options.baseUrl) >= 0 &&
          labels.indexOf(t.options.baseUrl) < labels.indexOf(t.options.apiKey),
        labels.join("|"),
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
      await poll(async () =>
        (await setup.call(() => document.body.innerText)).includes(
          t.setup.connectionOk.replace("{model}", MODEL),
        ),
      );
      const provider = await poll(async () => {
        const providers = await stored(setup, STORAGE_KEYS.provider);
        const saved = providers?.openai;
        return saved?.apiKey === "sk-test" && saved.models?.length && saved;
      });
      assert.equal(provider.baseUrl, `${fixture.baseUrl}/v1`);
      assert.deepEqual(
        provider.models.map((model) => model.name),
        [MODEL],
      );
      assert.equal(
        (await stored(setup, STORAGE_KEYS.preferences)).selectedModelId,
        provider.models[0].id,
      );
      await poll(async () => (await forward(setup)) === t.setup.next);
      await clickForward(setup);

      // On web pages: three switches, as they are by default.
      await atStep(setup, t.setup.pagesTitle);
      const switches = () =>
        setup.call(() =>
          [...document.querySelectorAll(".setup-feature [role='switch']")].map(
            (item) => item.getAttribute("aria-checked"),
          ),
        );
      await poll(async () => (await switches()).length === 3);
      assert.deepEqual(await switches(), ["true", "false", "false"]);
      for (const index of [0, 1, 2])
        await setup.call(
          (index) =>
            document
              .querySelectorAll(".setup-feature [role='switch']")
              [index].click(),
          index,
        );
      await poll(async () => {
        const preferences = await stored(setup, STORAGE_KEYS.preferences);
        return (
          preferences?.pageTranslate?.pageButton === false &&
          preferences.pageTranslate.videoSubtitles === true &&
          preferences.smartBar?.enabled === true &&
          preferences.smartBar.trigger === "selection"
        );
      });
      await clickForward(setup);

      // Done: no note (a model is set), the shortcuts, and the side panel.
      await atStep(setup, t.setup.doneTitle);
      assert.equal(
        await setup.call(() => !!document.querySelector(".setup-note")),
        false,
      );
      await poll(async () =>
        (await texts(setup, ".settings-toggle-row")).some((row) =>
          row.startsWith(t.settings.openSidePanelCommand),
        ),
      );
      assert.equal(await forward(setup), "");
      // The side panel opens and the setup tab closes.
      await clickElement(setup, "button", { text: t.setup.openPanel });
      await poll(async () => {
        const urls = (await browser.targets()).map((target) => target.url);
        return (
          urls.includes(extensionUrl("sidepanel.html")) &&
          !urls.includes(extensionUrl(`options.html${OPTIONS_HASH.welcome}`))
        );
      });
    } finally {
      await session.close();
    }
  },
);

test(
  "first run: no side panel before setup; skipping every step, resuming from the toolbar button, and running setup again",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await launch();
    const { browser, extensionUrl } = session;
    const setupUrl = extensionUrl(`options.html${OPTIONS_HASH.welcome}`);
    const panelUrl = extensionUrl("sidepanel.html");
    const isOpen = async (url) =>
      (await browser.targets()).some((target) => target.url === url);
    try {
      let setup = await openedSetup(session);
      const worker = await browser.attach(
        (url) => url === extensionUrl("background.js"),
        "service_worker",
      );
      const panelOpensItself = () =>
        worker.call(
          async () =>
            (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
        );
      // Until setup is finished the toolbar button doesn't open the panel
      // by itself: its click comes to the extension.
      assert.equal(await panelOpensItself(), false);
      await clickForward(setup);
      await atStep(setup, t.setup.providerTitle);
      assert.equal(await forward(setup), t.setup.skipStep);
      await poll(() =>
        setup.call(
          async (key) =>
            (await chrome.storage.session.get(key))[key]?.step === "provider",
          STORAGE_KEYS.setupProgress,
        ),
      );

      // Closed, setup opens again where it was from the toolbar button and
      // from "Ask" in the right-click menu, and the side panel doesn't.
      const page = await browser.open("about:blank");
      const closeTab = async (url) => {
        const target = (await browser.targets()).find(
          (item) => item.url === url,
        );
        await browser.browser.send("Target.closeTarget", {
          targetId: target.id,
        });
        await poll(async () => !(await isOpen(url)));
      };
      const closeSetup = () => closeTab(setupUrl);
      const tab = () =>
        worker.call(async () => (await chrome.tabs.query({ active: true }))[0]);
      await closeSetup();
      await worker.call(
        (tab) => chrome.action.onClicked.dispatch(tab),
        await tab(),
      );
      await poll(() => isOpen(setupUrl));
      setup = await browser.attach((url) => url === setupUrl);
      await setup.send("Page.bringToFront");
      await atStep(setup, t.setup.providerTitle);
      await closeSetup();
      await page.send("Page.bringToFront");
      await worker.call(
        ({ tab, id }) =>
          chrome.contextMenus.onClicked.dispatch(
            { menuItemId: id, editable: false, pageUrl: tab.url },
            tab,
          ),
        { tab: await tab(), id: CONTEXT_MENU_ID.ask },
      );
      await poll(() => isOpen(setupUrl));
      assert.equal(await isOpen(panelUrl), false);
      setup = await browser.attach((url) => url === setupUrl);
      await setup.send("Page.bringToFront");
      await atStep(setup, t.setup.providerTitle);

      await clickForward(setup);
      await atStep(setup, t.setup.pagesTitle);
      await clickForward(setup);
      await atStep(setup, t.setup.doneTitle);
      // Chat needs an AI provider: one note, with the way back.
      assert.deepEqual(await texts(setup, ".setup-note p"), [
        t.setup.noProviderNote,
      ]);
      // Done: the toolbar button opens the panel from now on, and the panel
      // without a model is one line to add an AI provider.
      await poll(panelOpensItself);
      const panel = await browser.open(panelUrl);
      await poll(async () =>
        (await texts(panel, ".no-model-mode button")).includes(
          t.sidepanel.addProvider,
        ),
      );
      assert.equal(
        await panel.call(() => document.body.innerText.trim()),
        t.sidepanel.addProvider,
      );

      await setup.send("Page.bringToFront");
      await clickElement(setup, ".setup-note button");
      await atStep(setup, t.setup.providerTitle);
      await clickElement(setup, "button", { text: t.setup.back });
      await atStep(setup, t.setup.languageTitle);
      await clickForward(setup);
      await atStep(setup, t.setup.providerTitle);

      // General → "Run setup again" starts over, in the setup tab that is
      // open.
      const general = await browser.open(extensionUrl("options.html"));
      await clickElement(general, "button", { text: t.setup.runAgain });
      await setup.send("Page.bringToFront");
      await atStep(setup, t.setup.languageTitle);
      assert.equal(
        (await browser.targets()).filter((target) => target.url === setupUrl)
          .length,
        1,
      );

      // Done from there: the side panel opens, the setup tab closes and
      // the settings tab that ran it is in front again.
      await closeTab(panelUrl);
      for (const title of [t.setup.providerTitle, t.setup.pagesTitle]) {
        await clickForward(setup);
        await atStep(setup, title);
      }
      await clickForward(setup);
      await atStep(setup, t.setup.doneTitle);
      await clickElement(setup, "button", { text: t.setup.openPanel });
      await poll(
        async () => (await isOpen(panelUrl)) && !(await isOpen(setupUrl)),
      );
      const front = await worker.call(
        async () =>
          (
            await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          )[0]?.url,
      );
      assert.equal(front, extensionUrl("options.html"));
    } finally {
      await session.close();
    }
  },
);
