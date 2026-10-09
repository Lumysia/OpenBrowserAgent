import assert from "node:assert/strict";
import { poll } from "./chromium.mjs";
import { composerStatus, installComposerProbe } from "./composer-probe.mjs";

// Drive React's actual composer with browser input events, then verify persisted
// chat parts and the rendered answer. Return counts only, including in live mode.
export async function checkComposer(page, config, verifyRendered) {
  await configureComposer(page, config);
  try {
    const prompt =
      "Use manageTabs with operation=list to list the open tabs, then briefly report the result.";
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
  await page.call(async (config) => {
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
      "debug-logging-enabled": false,
    });
  }, config);
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

export async function typeComposer(page, prompt) {
  await page.call(() =>
    document.querySelector(".composer-box textarea").focus(),
  );
  await page.send("Input.insertText", {
    text: prompt,
  });
}

export async function sendComposer(page) {
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await page.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
}
