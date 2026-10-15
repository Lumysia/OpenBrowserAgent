import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n.ts";
import { modelStopNote } from "../src/shared/run-stop.ts";
import { UI_STATE } from "../src/ui/ui-state.ts";
import { sendComposer, typeComposer } from "./browser-composer.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  BROWSER_TEST_TIMEOUT,
  fixtureProvider,
  startExtension,
} from "./browser-harness.mjs";
import { streamText } from "./provider-fixtures.ts";

const t = getMessages("en-US");
const labels = t.sidepanel.runStop;

// Each prompt makes the fixture model end its reply one way. The ones that
// wait are let go by the test (`release`).
const waiting = {};
const release = (prompt) => waiting[prompt]?.();
const REPLIES = {
  BREAK: async (write) => {
    write("Partial ALPHA answer");
    await new Promise((resolve) => (waiting.BREAK = resolve));
    return { finishReason: null };
  },
  QUEUED: (write) => write("Queued GAMMA answer"),
  LENGTH: (write) => {
    write("Long DELTA text");
    return { finishReason: "length" };
  },
  [labels.continueMessage]: (write) => write("Continued EPSILON"),
  STOPME: async (write) => {
    write("Stoppable ZETA");
    await new Promise((resolve) => (waiting.STOPME = resolve));
  },
};

function latestUserText(request) {
  const user = request.body.messages.filter((item) => item.role === "user");
  return JSON.stringify(user.at(-1)?.content);
}

test(
  "side panel shows a response that ended early once, with its notice, and goes on",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension({
      handle: (request, response) => {
        if (!request.url.startsWith("/v1/"))
          return response.writeHead(404).end();
        const prompt = latestUserText(request);
        const key = Object.keys(REPLIES).find((item) => prompt.includes(item));
        return streamText(response, REPLIES[key] || ((write) => write("?")));
      },
      storage: (baseUrl) => ({
        provider: { fixture: fixtureProvider(baseUrl) },
        language: "en-US",
        preferences: { selectedModelId: "fixture", autoRetry: false },
      }),
    });
    const { browser, extensionUrl, fixture } = session;
    try {
      const panel = await browser.open(extensionUrl("sidepanel.html"));
      await poll(() =>
        panel.call(() => !!document.querySelector(".composer-box textarea")),
      );
      const page = () =>
        panel.call(
          (errorState) => ({
            text: document.querySelector(".messages")?.textContent || "",
            notices: [...document.querySelectorAll(".run-stop-notice")].map(
              (item) => ({
                text: item.textContent,
                error: item.dataset.state === errorState,
                continue: !!item.querySelector("button"),
              }),
            ),
            streaming: !!document.querySelector(".stop-button"),
          }),
          UI_STATE.error,
        );
      const count = (text, part) => text.split(part).length - 1;
      const send = async (text) => {
        await typeComposer(panel, text);
        await sendComposer(panel);
      };

      // A stream that breaks mid-answer, with a message queued meanwhile.
      await send("BREAK please");
      await poll(async () => (await page()).text.includes("ALPHA"));
      await send("QUEUED please");
      release("BREAK");
      let state = await poll(async () => {
        const value = await page();
        return value.text.includes("GAMMA") && !value.streaming && value;
      });
      assert.equal(count(state.text, "Partial ALPHA answer"), 1);
      assert.equal(state.notices.length, 1);
      assert.equal(state.notices[0].error, true);
      // The queued message went as its own request, after the cut reply
      // and the note that it was cut.
      const queued = fixture.requests.find((request) =>
        latestUserText(request).includes("QUEUED"),
      );
      assert.match(
        JSON.stringify(queued.body.messages),
        new RegExp(modelStopNote("error").replace(/[[\].]/g, "\\$&")),
      );

      // A reply cut at the output limit: Continue asks the model to go on.
      await send("LENGTH please");
      state = await poll(async () => {
        const value = await page();
        return value.notices.length === 2 && !value.streaming && value;
      });
      assert.equal(state.notices[1].text.includes(labels.length), true);
      assert.equal(state.notices[1].continue, true);
      await clickElement(panel, ".run-stop-notice button", {
        text: labels.continue,
      });
      state = await poll(async () => {
        const value = await page();
        return value.text.includes("EPSILON") && !value.streaming && value;
      });
      assert.equal(count(state.text, "Long DELTA text"), 1);
      // Only the chat's latest response offers Continue.
      assert.ok(state.notices.every((notice) => !notice.continue));

      // Stop: the response says it was stopped.
      await send("STOPME please");
      await poll(async () => (await page()).text.includes("ZETA"));
      await clickElement(panel, ".stop-button");
      state = await poll(async () => {
        const value = await page();
        return value.notices.length === 3 && !value.streaming && value;
      });
      assert.equal(state.notices[2].text.includes(labels.aborted), true);
      release("STOPME");
    } finally {
      await session.close();
    }
  },
);
