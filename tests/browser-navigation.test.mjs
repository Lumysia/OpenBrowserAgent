import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";

test(
  "open waits for the requested extension document before exposing storage",
  { timeout: 30000 },
  async () => {
    const NativeWebSocket = globalThis.WebSocket;
    let firstEvaluation;
    let evaluationObserved = false;
    const evaluated = new Promise((resolve) => {
      firstEvaluation = resolve;
    });
    // Observe the real readiness response so the test can hold/release navigation
    // by an event barrier. No delays, page-content mocks, or product changes.
    globalThis.WebSocket = class extends NativeWebSocket {
      send(data) {
        const command = JSON.parse(String(data));
        if (!evaluationObserved && command.method === "Runtime.evaluate") {
          evaluationObserved = true;
          const listener = ({ data }) => {
            const response = JSON.parse(String(data));
            if (response.id !== command.id) return;
            this.removeEventListener("message", listener);
            firstEvaluation(this);
          };
          this.addEventListener("message", listener);
        }
        return super.send(data);
      }
    };
    let browser;
    try {
      browser = await launchExtension({
        headed: process.env.OBA_HEADLESS !== "1",
      });
      const expected = `chrome-extension://${browser.id}/sidepanel.html`;
      const send = browser.browser.send.bind(browser.browser);
      browser.browser.send = (method, params) =>
        send(
          method,
          method === "Target.createTarget"
            ? { ...params, url: "about:blank" }
            : params,
        );
      let returned = false;
      const opening = browser.open(expected).then((page) => {
        returned = true;
        return page;
      });
      const pageSocket = await evaluated;
      // Drain the promise chain for the observed response. This is a scheduler
      // checkpoint, not a wall-clock wait that assumes navigation has finished.
      await setImmediate();
      const returnedBeforeNavigation = returned;
      pageSocket.send(
        JSON.stringify({
          id: 999999999,
          method: "Page.navigate",
          params: { url: expected },
        }),
      );
      const page = await opening;
      await poll(() =>
        page.call(
          (expected) =>
            location.href === expected &&
            document.readyState === "complete" &&
            typeof globalThis.chrome?.storage?.local?.set === "function",
          expected,
        ),
      );
      await page.call(async () => {
        await chrome.storage.local.set({ language: "en-US" });
      });
      assert.equal(
        returnedBeforeNavigation,
        false,
        "open must not accept the complete initial blank document",
      );
    } finally {
      try {
        await browser?.close();
      } finally {
        globalThis.WebSocket = NativeWebSocket;
      }
    }
  },
);
