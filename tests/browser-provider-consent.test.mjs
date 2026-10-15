import assert from "node:assert/strict";
import { test } from "node:test";
import { providerConsentEnUS as TEXT } from "../src/shared/locales/provider-consent/en-US.ts";
import { displayEnUS } from "../src/shared/locales/display/en-US.ts";
import { sendComposer, typeComposer } from "./browser-composer.mjs";
import { BROWSER_TEST_TIMEOUT, unchangedFor } from "./browser-harness.mjs";
import { typeText } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  barState,
  clickInBar,
  resultText,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";

// Permission before a provider receives the user's content: the provider
// form's required checkbox, the side panel's question before a send, the
// smart bar's, and local endpoints that never ask. A host name the browser
// resolves to the fixture stands in for a remote provider.
const REMOTE = "ai.consent.test";
const PAGE = `<!doctype html><title>Consent</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p{width:420px}</style>
<p id="text">The quick brown fox jumps over the lazy dog.</p>`;

test("provider consent", { timeout: BROWSER_TEST_TIMEOUT }, async (t) => {
  const session = await startSmartBar({
    pages: { "/page": PAGE },
    answer: async (_prompt, write) => write("Fixture answer."),
    smartBar: { enabled: true },
    args: [`--host-resolver-rules=MAP ${REMOTE} 127.0.0.1`],
  });
  const { browser, fixture, options, extensionUrl, url, setPreferences } =
    session;
  const port = new URL(fixture.baseUrl).port;
  const host = `${REMOTE}:${port}`;
  const remote = (extra = {}) => ({
    id: "remote",
    type: "openai",
    baseUrl: `http://${host}/v1`,
    models: [{ id: "remote:m", name: "m" }],
    ...extra,
  });
  const modelRequests = () =>
    fixture.requests.filter((request) => request.url.startsWith("/v1/")).length;
  const setProviders = async (provider) => {
    await options.call(
      (provider) => chrome.storage.local.set({ provider }),
      provider,
    );
    await setPreferences({ selectedModelId: "remote:m" });
  };
  const storedProvider = (id) =>
    options.call(
      async (id) => (await chrome.storage.local.get("provider")).provider[id],
      id,
    );
  try {
    await t.test("settings: the key waits for the checkbox", async () => {
      await setProviders({ remote: remote() });
      await options.send("Page.navigate", {
        url: extensionUrl("options.html#/providers"),
      });
      await poll(() =>
        options.call(
          () =>
            !!document.querySelector(
              ".ui-accordion-trigger:has(.provider-summary)",
            ),
        ),
      );
      // The provider from an older version asks for permission.
      assert.ok(
        await options.call(
          (text) =>
            document
              .querySelector(".ui-accordion-trigger:has(.provider-summary)")
              .textContent.includes(text),
          TEXT.needsPermission,
        ),
      );
      await options.call(() =>
        document
          .querySelector(".ui-accordion-trigger:has(.provider-summary)")
          .click(),
      );
      const agreement = TEXT.agreement.replace("{host}", host);
      assert.equal(
        await poll(() =>
          options.call(
            () => document.querySelector(".ui-checkbox")?.textContent,
          ),
        ),
        agreement,
      );
      // Edits save as they are made; the API key waits for the box.
      await typeText(options, "sk-remote", 'input[type="password"]');
      await poll(() =>
        options.call(
          (text) => document.body.textContent.includes(text),
          TEXT.requiredToSave,
        ),
      );
      await typeText(
        options,
        " edited",
        `input[placeholder="${displayEnUS.providerTypes.openai}"]`,
      );
      await poll(async () =>
        (await storedProvider("remote"))?.label?.endsWith(" edited"),
      );
      assert.equal(
        await unchangedFor(async () => (await storedProvider("remote")).apiKey),
        undefined,
      );
      await options.call(() =>
        document.querySelector(".ui-checkbox input").click(),
      );
      await poll(
        async () => (await storedProvider("remote"))?.apiKey === "sk-remote",
      );
      const saved = await poll(
        async () => (await storedProvider("remote"))?.consent,
      );
      assert.equal(saved.host, host);
      await poll(() =>
        options.call(
          (text) =>
            document
              .querySelector(".provider-consent-status")
              ?.textContent.includes(text),
          TEXT.allowed,
        ),
      );
    });

    await t.test("settings: withdrawing asks again", async () => {
      await options.call(
        (label) =>
          [...document.querySelectorAll(".provider-consent-status button")]
            .find((button) => button.textContent === label)
            .click(),
        TEXT.withdraw,
      );
      await poll(async () => !(await storedProvider("remote")).consent);
      await poll(() =>
        options.call(() => !!document.querySelector(".ui-checkbox input")),
      );
    });

    const panel = await browser.open(extensionUrl("sidepanel.html"));
    const promptShown = () =>
      panel.call(() => !!document.querySelector(".provider-consent-prompt"));
    const answer = (label) =>
      panel.call(
        (label) =>
          [...document.querySelectorAll(".provider-consent-prompt button")]
            .find((button) => button.textContent === label)
            .click(),
        label,
      );
    const composerText = () =>
      panel.call(() => document.querySelector(".composer-box textarea").value);
    const ready = () =>
      poll(() =>
        panel.call(() => !!document.querySelector(".composer-box textarea")),
      );

    await t.test("side panel: asks before the first send", async () => {
      await setProviders({ remote: remote() });
      await panel.send("Page.reload");
      await ready();
      const before = modelRequests();
      await typeComposer(panel, "Hello there");
      await sendComposer(panel);
      await poll(promptShown);
      assert.ok(
        (
          await panel.call(
            () =>
              document.querySelector(".provider-consent-prompt").textContent,
          )
        ).includes(`is sent to ${host}.`),
      );
      assert.equal(
        await unchangedFor(modelRequests),
        before,
        "nothing is sent while asking",
      );
      await answer("Not now");
      await poll(async () => !(await promptShown()));
      assert.equal(
        await unchangedFor(modelRequests),
        before,
        "nothing is sent when declined",
      );
      assert.equal(await composerText(), "Hello there");
      assert.equal((await storedProvider("remote")).consent, undefined);

      await sendComposer(panel);
      await poll(promptShown);
      await answer("Agree");
      await poll(() => modelRequests() > before);
      assert.equal((await storedProvider("remote")).consent.host, host);
      await poll(() =>
        panel.call(() => document.body.textContent.includes("Fixture answer.")),
      );
    });

    await t.test("side panel: no question once allowed", async () => {
      await poll(() =>
        panel.call(() => !document.querySelector(".typing-indicator")),
      );
      const before = modelRequests();
      await typeComposer(panel, "Again");
      await sendComposer(panel);
      await poll(() => modelRequests() > before);
      assert.equal(await promptShown(), false);
    });

    await t.test("side panel: withdrawn permission asks again", async () => {
      await setProviders({
        remote: { ...(await storedProvider("remote")), consent: undefined },
      });
      await panel.send("Page.reload");
      await ready();
      const before = modelRequests();
      await typeComposer(panel, "Third");
      await sendComposer(panel);
      await poll(promptShown);
      await answer("Not now");
      assert.equal(await unchangedFor(modelRequests), before);
    });

    await t.test("side panel: a local provider never asks", async () => {
      await setProviders({
        remote: remote({ baseUrl: `${fixture.baseUrl}/v1` }),
      });
      await panel.send("Page.reload");
      await ready();
      const before = modelRequests();
      await typeComposer(panel, "Local");
      await sendComposer(panel);
      await poll(() => modelRequests() > before);
      assert.equal(await promptShown(), false);
    });

    await t.test("smart bar: asks in the bar, then runs", async () => {
      await setProviders({ remote: remote() });
      const page = await browser.open(url("/page"));
      const before = modelRequests();
      await selectText(page, "#text");
      await poll(async () => (await barState(page)) === "toolbar");
      await clickInBar(page, '[aria-label="Explain"]');
      await poll(async () =>
        (await resultText(page)).includes(`is sent to ${host}.`),
      );
      assert.equal(modelRequests(), before);
      await clickInBar(page, "button", "Agree");
      await poll(async () =>
        (await resultText(page)).includes("Fixture answer."),
      );
      assert.equal((await storedProvider("remote")).consent.host, host);
    });
  } finally {
    await session.close();
  }
});
