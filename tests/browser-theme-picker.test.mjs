import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { hoverTooltip } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";

// Every theme swatch shows its name when the pointer rests on it. The drawn
// swatch moves on hover (a flag tilts), so it must never take the pointer
// from the input that carries the tooltip.
test(
  "theme swatches show their tooltip on hover",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension();
    try {
      const page = await browser.open(
        `chrome-extension://${browser.id}/options.html`,
      );
      await poll(
        () => page.call(() => !!document.querySelector(".theme-swatch")),
        20000,
      );
      // Measured once, after the one scroll that brings them into view.
      await page.call(() =>
        document
          .querySelector(".theme-swatch")
          .scrollIntoView({ block: "center" }),
      );
      const swatches = await page.call(() =>
        [...document.querySelectorAll(".theme-swatch")].map((swatch) => {
          const rect = swatch.getBoundingClientRect();
          return {
            label: swatch.querySelector("input").ariaLabel,
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          };
        }),
      );
      assert.ok(swatches.length >= 10);
      const shown = [];
      for (const { label, x, y } of swatches) {
        shown.push(await hoverTooltip(page, { x, y }));
        assert.equal(shown.at(-1), label, `tooltip for ${label}`);
      }
    } finally {
      await browser.close();
    }
  },
);
