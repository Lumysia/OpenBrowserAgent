import assert from "node:assert/strict";
import { poll } from "./chromium.mjs";

export async function checkSelectorTheme(page, tabId) {
  await page.call(async (tabId) => {
    await chrome.storage.sync.set({
      preferences: { colorScheme: "light", accentColor: "amber" },
    });
    const { preferences } = await chrome.storage.local.get("preferences");
    await chrome.storage.local.set({
      language: "en-US",
      preferences: { ...preferences, colorScheme: "dark", accentColor: "blue" },
    });
    await chrome.tabs.update(tabId, { active: true });
  }, tabId);
  await page.send("Page.reload");
  await poll(() =>
    page.call(
      () =>
        !!document.querySelector('.composer-controls button[aria-label="Add"]'),
    ),
  );
  await page.call(() =>
    document
      .querySelector('.composer-controls button[aria-label="Add"]')
      .click(),
  );
  await poll(() =>
    page.call(() =>
      Array.from(document.querySelectorAll("button")).some(
        (button) =>
          button.textContent.includes("Select element") && !button.disabled,
      ),
    ),
  );
  await page.call(() =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent.includes("Select element"))
      .click(),
  );
  const theme = await poll(() =>
    page.call(async (tabId) => {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const root = document.querySelector(
            '[data-oba-selector-root="true"]',
          );
          return root
            ? {
                accent: root.style.getPropertyValue("--oba-selector-accent"),
                foreground: root.style.getPropertyValue(
                  "--oba-selector-foreground",
                ),
              }
            : null;
        },
      });
      return result.result;
    }, tabId),
  );
  assert.deepEqual(theme, { accent: "#3b82f6", foreground: "#f8fafc" });
  await page.call(
    async (tabId) =>
      chrome.tabs.sendMessage(tabId, { type: "cancelElementSelector" }),
    tabId,
  );
}
