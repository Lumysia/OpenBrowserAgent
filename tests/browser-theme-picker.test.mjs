import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";

// Every theme swatch shows its name when the pointer rests on it. The drawn
// swatch moves on hover (a flag tilts), so it must never take the pointer
// from the input that carries the tooltip.
test(
  "theme swatches show their tooltip on hover",
  { timeout: 120000 },
  async () => {
    const browser = await launchExtension({
      headed: process.env.OBA_HEADLESS !== "1",
    });
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
        // Away first, so each tooltip opens from scratch.
        await page.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: 2,
          y: 2,
        });
        await delay(200);
        for (const dx of [-8, -4, 0])
          await page.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: x + dx,
            y,
          });
        shown.push(
          await poll(
            () =>
              page.call(
                () => document.querySelector('[role="tooltip"]')?.textContent,
              ),
            5000,
          ).catch(() => "none"),
        );
        assert.equal(shown.at(-1), label, `tooltip for ${label}`);
      }
    } finally {
      await browser.close();
    }
  },
);
