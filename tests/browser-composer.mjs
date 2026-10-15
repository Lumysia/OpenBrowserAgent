import assert from "node:assert/strict";
import { startExtension } from "./browser-harness.mjs";
import { pressKey, typeText } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import { composerStatus, installComposerProbe } from "./composer-probe.mjs";

// Own the loopback provider and disposable browser together, including partial
// setup failures. Tests can install pre-navigation barriers before configure().
export async function composerFixture(handle) {
  const session = await startExtension({ handle });
  const { browser, fixture, extensionUrl, close } = session;
  try {
    const page = await browser.open(extensionUrl("sidepanel.html"));
    const config = {
      provider: "openai",
      model: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
      apiKey: "",
    };
    return {
      ...fixture,
      browser,
      page,
      config,
      configure: () => configureComposer(page, config),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

// Drive React's actual composer with browser input events, then verify persisted
// chat parts and the rendered answer. Return counts only, including in live mode.
export async function checkComposer(page, config, verifyRendered) {
  await configureComposer(page, config);
  try {
    const prompt =
      "Use tabs with action=list to list the open tabs, then briefly report the result.";
    await installComposerProbe(page, prompt);
    await submitComposer(page, prompt);
    let persisted;
    try {
      await poll(async () => {
        persisted = await composerStatus(page);
        return (
          persisted.freshAssistantMessages === 1 &&
          persisted.textCharacters > 0 &&
          persisted.completedToolParts > 0 &&
          !persisted.streamActive
        );
      }, 150000);
      // Provider completion and React's text reveal are distinct boundaries.
      await poll(async () => {
        persisted = await composerStatus(page);
        return persisted.answerRendered;
      }, 15000);
    } catch {
      // Only booleans/counts cross CDP. Never print raw live answers or errors.
      assert.fail(
        `Composer persistence/render acceptance failed: ${JSON.stringify(persisted || { statusAvailable: false })}`,
      );
    }
    assert.equal(
      persisted.answerRendered,
      true,
      "Composer answer must render in the sidepanel",
    );
    await verifyRendered?.(persisted);
    return persisted;
  } finally {
    await page.call(() => chrome.storage.local.remove("provider"));
  }
}

export async function configureComposer(page, config) {
  await page.call(
    async ({ config }) => {
      await chrome.storage.local.set({
        provider: {
          acceptance: {
            id: "acceptance",
            type: config.provider,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            models: [{ id: "acceptance-model", name: config.model }],
          },
        },
        language: "en-US",
        preferences: {
          selectedModelId: "acceptance-model",
          maxToolSteps: 3,
          autoRetry: false,
        },
      });
    },
    { config },
  );
  await page.send("Page.reload");
  await page.send("Page.bringToFront");
  await poll(() =>
    page.call(() => !!document.querySelector(".composer-box textarea")),
  );
}

export async function submitComposer(page, prompt) {
  await typeComposer(page, prompt);
  await sendComposer(page);
}

export function typeComposer(page, prompt) {
  return typeText(page, prompt, ".composer-box textarea");
}

export function sendComposer(page) {
  return pressKey(page, "Enter");
}
