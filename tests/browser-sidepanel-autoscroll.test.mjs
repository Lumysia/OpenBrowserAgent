import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { sendComposer, typeComposer } from "./browser-composer.mjs";
import { nextFrames, poll, settled } from "./chromium.mjs";
import { startSmartBar } from "./smart-bar-page.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// The chat follows a streaming answer only while the reader stays at the
// bottom: a small scroll up stops it, also when the answer ends.
const LINES = 120;

test(
  "side panel auto-scroll leaves a reader who scrolled up",
  {
    timeout: BROWSER_TEST_TIMEOUT,
  },
  async () => {
    let release;
    const session = await startSmartBar({
      pages: {},
      answer: async (_prompt, write) => {
        for (let i = 1; i <= LINES / 2; i += 1) {
          write(`Line ${i} of a long answer.\n\n`);
          await delay(15);
        }
        await new Promise((resolve) => (release = resolve));
        for (let i = LINES / 2 + 1; i <= LINES; i += 1) {
          write(`Line ${i} of a long answer.\n\n`);
          await delay(15);
        }
      },
    });
    const { browser, extensionUrl } = session;
    try {
      await session.setPreferences({ autoScroll: true });
      const panel = await browser.open(extensionUrl("sidepanel.html"));
      await poll(() =>
        panel.call(() => !!document.querySelector(".composer-box textarea")),
      );
      await typeComposer(panel, "Write a long answer");
      await sendComposer(panel);
      await poll(() => typeof release === "function");
      const position = () =>
        panel.call(() => {
          const list = document.querySelector(".messages");
          return {
            top: list.scrollTop,
            fromBottom: list.scrollHeight - list.scrollTop - list.clientHeight,
          };
        });
      // Following while at the bottom.
      await poll(async () => (await position()).fromBottom <= 2);

      // A small move up, by the scrollbar (no wheel event).
      await panel.call(() => {
        const list = document.querySelector(".messages");
        list.scrollTop -= 80;
      });
      // Scroll events fire with the next frame.
      await nextFrames(panel);
      const held = (await position()).top;
      release();
      await poll(() =>
        panel.call(
          (last) => document.body.textContent.includes(last),
          `Line ${LINES} of`,
        ),
      );
      await poll(() =>
        panel.call(() => !document.querySelector(".typing-indicator")),
      );
      await settled(panel);
      const after = await position();
      assert.ok(
        Math.abs(after.top - held) <= 2,
        `stays where the reader left it (was ${held}, now ${after.top})`,
      );
      assert.ok(after.fromBottom > 200, "not pulled to the bottom at the end");
    } finally {
      await session.close();
    }
  },
);
