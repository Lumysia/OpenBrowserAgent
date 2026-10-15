import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import { startSmartBar } from "./smart-bar-page.mjs";

const t = getMessages("en-US");

// "Test model" in Settings goes through the background's model path: a
// working provider answers, and one without permission to receive content
// is stopped before any request.
const REMOTE = "ai.model-test.test";

test(
  "testing a model in Settings",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startSmartBar({
      pages: {},
      answer: async (_prompt, write) => write("OK"),
      args: [`--host-resolver-rules=MAP ${REMOTE} 127.0.0.1`],
    });
    const { fixture, options, extensionUrl } = session;
    const modelRequests = () =>
      fixture.requests.filter((request) => request.url.startsWith("/v1/"))
        .length;
    const port = new URL(fixture.baseUrl).port;
    // Opens the provider named `name` and presses its model's test button.
    const testIn = async (name) => {
      await options.call((name) => {
        const trigger = [
          ...document.querySelectorAll(".ui-accordion-trigger"),
        ].find((item) => item.textContent.includes(name));
        trigger.click();
      }, name);
      await poll(() =>
        options.call(
          ({ name, label }) => {
            const item = [
              ...document.querySelectorAll(".ui-accordion-item"),
            ].find((item) =>
              item
                .querySelector(":scope > .ui-accordion-header")
                ?.textContent.includes(name),
            );
            const button = item?.querySelector(`button[aria-label="${label}"]`);
            if (!button) return false;
            button.click();
            // The result shows in the model's row.
            button
              .closest(".ui-accordion-item")
              .querySelector(".model-row-trigger")
              .click();
            return true;
          },
          { name, label: t.options.testModel },
        ),
      );
    };
    const shownText = () => options.call(() => document.body.textContent);
    try {
      await options.call((provider) => chrome.storage.local.set({ provider }), {
        fixture: {
          id: "fixture",
          type: "openai",
          label: "Local fixture",
          baseUrl: `${fixture.baseUrl}/v1`,
          models: [{ id: "fixture:m", name: "m" }],
        },
        remote: {
          id: "remote",
          type: "openai",
          label: "Remote fixture",
          baseUrl: `http://${REMOTE}:${port}/v1`,
          models: [{ id: "remote:m", name: "m" }],
        },
      });
      await options.send("Page.navigate", {
        url: extensionUrl("options.html#/providers"),
      });
      await poll(() =>
        options.call(() =>
          document.body.textContent.includes("Remote fixture"),
        ),
      );

      const before = modelRequests();
      await testIn("Local fixture");
      await poll(async () =>
        (await shownText()).includes(t.options.testModelSuccess),
      );
      assert.ok(modelRequests() > before);

      const afterLocal = modelRequests();
      await testIn("Remote fixture");
      await poll(async () =>
        (await shownText()).includes(t.options.testModelError),
      );
      assert.equal(modelRequests(), afterLocal);
    } finally {
      await session.close();
    }
  },
);
