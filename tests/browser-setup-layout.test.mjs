import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { launchExtension, nextFrames, poll } from "./chromium.mjs";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";

// The guided setup's step and its Back / Next row are one group, a little
// above the middle of the window (the free height splits 38 : 62, see
// setup.css); a step taller than the window scrolls with the row in view.
const ABOVE_SHARE = 0.38;

async function show(page, step, [width, height]) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.call(
    ({ key, step }) =>
      chrome.storage.session.set({ [key]: { step, path: "new" } }),
    { key: STORAGE_KEYS.setupProgress, step },
  );
  await poll(() =>
    page.call(
      (step) => document.querySelector(".setup-wizard")?.dataset.step === step,
      step,
    ),
  );
  await nextFrames(page);
  return page.call(async () => {
    // The step's entrance moves it.
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished),
    );
    const wizard = document.querySelector(".setup-wizard");
    const style = getComputedStyle(wizard);
    const top =
      wizard.getBoundingClientRect().top + parseFloat(style.paddingTop);
    const bottom =
      wizard.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
    const step = document.querySelector(".setup-step").getBoundingClientRect();
    const actions = document.querySelector(".setup-wizard-actions");
    const row = actions.getBoundingClientRect();
    const viewport = document.querySelector(
      ".setup-wizard-scroll > .ui-scroll-area-viewport",
    );
    return {
      above: step.top - top,
      below: bottom - row.bottom,
      gap: row.top - step.bottom,
      rowGap: parseFloat(getComputedStyle(actions).marginTop),
      inView: row.bottom <= innerHeight,
      scrolls: viewport.scrollHeight > viewport.clientHeight,
    };
  });
}

test(
  "guided setup: the step and its buttons sit together above the middle",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension({});
    try {
      const page = await browser.open(
        `chrome-extension://${browser.id}/options.html#/welcome`,
      );
      // A short step: the row right under it, the group above the middle.
      const short = await show(page, "path", [1280, 800]);
      assert.ok(Math.abs(short.gap - short.rowGap) <= 1, `${short.gap}`);
      assert.equal(short.scrolls, false);
      const share = short.above / (short.above + short.below);
      assert.ok(Math.abs(share - ABOVE_SHARE) < 0.02, `${share}`);
      // A step taller than the window starts at the top and scrolls; the
      // row stays in view.
      // (The shortcuts list in it arrives a moment later.)
      const tall = await poll(async () => {
        const layout = await show(page, "done", [1024, 480]);
        return layout.scrolls && layout;
      });
      assert.deepEqual(
        [Math.round(tall.above), Math.round(tall.below), tall.inView],
        [0, 0, true],
      );
    } finally {
      await browser.close();
    }
  },
);
