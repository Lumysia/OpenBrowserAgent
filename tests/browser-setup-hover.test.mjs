import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement, elementCenter, movePointer } from "./cdp-input.mjs";
import { launchExtension, poll, settled } from "./chromium.mjs";

// The guided setup's controls answer the pointer: hovering a choice card or
// the primary button changes its edge and fill enough to see, in light and
// dark, the chosen card's fill included, and a hovered card still looks
// less chosen than the chosen one.

const t = getMessages("en-US");

// How far a hover moves the element's border and background: the contrast
// ratio between the resting and hovered colors, as drawn on a canvas.
function edgeAndFill(page, selector, text) {
  return page.call(
    ({ selector, text }) => {
      const element = [...document.querySelectorAll(selector)].find((item) =>
        item.textContent.includes(text),
      );
      const style = getComputedStyle(element);
      return {
        border: style.borderTopColor,
        background: style.backgroundColor,
      };
    },
    { selector, text },
  );
}

function contrast(page, from, to) {
  return page.call(
    ({ from, to }) => {
      const context = document
        .createElement("canvas")
        .getContext("2d", { willReadFrequently: true });
      const luminance = (color) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(document.body).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const channels = [...context.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((value) => {
            const v = value / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return (
          0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
        );
      };
      const [high, low] = [luminance(from), luminance(to)].sort(
        (a, b) => b - a,
      );
      return (high + 0.05) / (low + 0.05);
    },
    { from, to },
  );
}

// The resting and hovered colors of the element, and how far apart.
async function hoverChange(page, selector, text) {
  await movePointer(page, { x: 1, y: 1 });
  await settled(page);
  const rest = await edgeAndFill(page, selector, text);
  await movePointer(page, await elementCenter(page, selector, { text }));
  await settled(page);
  const hovered = await edgeAndFill(page, selector, text);
  return {
    hovered,
    border: await contrast(page, rest.border, hovered.border),
    background: await contrast(page, rest.background, hovered.background),
  };
}

// A hovered card stays short of the chosen one: its edge and fill are
// nearer the page's background.
async function assertShortOfChosen(page, hovered, chosen, name) {
  const backdrop = await page.call(
    () => getComputedStyle(document.body).backgroundColor,
  );
  for (const part of ["border", "background"]) {
    const [near, far] = [
      await contrast(page, backdrop, hovered[part]),
      await contrast(page, backdrop, chosen[part]),
    ];
    assert.ok(
      near < far,
      `${name}: hovered ${part} ${near.toFixed(3)}:1, chosen ${far.toFixed(3)}:1`,
    );
  }
}

// An edge that moves this far reads as a change at a glance; a fill a
// third of that, as it covers the whole control.
const MIN_BORDER = 1.25;
const MIN_BACKGROUND = 1.05;

// `edge: false` for the chosen card, whose accent edge stays.
function assertVisible(change, name, { edge = true } = {}) {
  assert.ok(
    !edge || change.border >= MIN_BORDER,
    `${name}: border moves ${change.border.toFixed(3)}:1`,
  );
  assert.ok(
    change.background >= MIN_BACKGROUND,
    `${name}: background moves ${change.background.toFixed(3)}:1`,
  );
}

test(
  "setup: choice cards and the primary button show a visible hover in light and dark",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension({ keepWelcome: true });
    try {
      const url = `chrome-extension://${browser.id}/options.html${OPTIONS_HASH.welcome}`;
      await poll(async () =>
        (await browser.targets()).some((target) => target.url === url),
      );
      const setup = await browser.attach((target) => target === url);
      // In front: a background tab runs no transitions.
      await setup.send("Page.bringToFront");
      await setup.call(
        (key) => chrome.storage.local.set({ [key]: "en-US" }),
        STORAGE_KEYS.language,
      );
      const atStep = (title) =>
        poll(() =>
          setup.call(
            (title) =>
              document.querySelector(".setup-step h1")?.textContent === title,
            title,
          ),
        );
      await atStep(t.setup.languageTitle);
      for (const scheme of ["light", "dark"]) {
        await setup.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-color-scheme", value: scheme }],
        });
        await poll(() =>
          setup.call(
            (scheme) => document.documentElement.dataset.scheme === scheme,
            scheme,
          ),
        );
        await atStep(t.setup.languageTitle);
        assertVisible(
          await hoverChange(setup, ".setup-forward", t.setup.next),
          `${scheme} Next`,
        );
        await clickElement(setup, ".setup-forward");
        await atStep(t.setup.pathTitle);
        assertVisible(
          await hoverChange(setup, ".ui-choice-card", t.setup.pathReturning),
          `${scheme} choice card`,
        );
        // The chosen card answers too.
        await clickElement(setup, ".ui-choice-card", { text: t.setup.pathNew });
        await atStep(t.setup.providerTitle);
        await clickElement(setup, "button", { text: t.setup.back });
        await atStep(t.setup.pathTitle);
        assertVisible(
          await hoverChange(setup, ".ui-choice-card", t.setup.pathNew),
          `${scheme} chosen choice card`,
          { edge: false },
        );
        const other = await hoverChange(
          setup,
          ".ui-choice-card",
          t.setup.pathReturning,
        );
        await assertShortOfChosen(
          setup,
          other.hovered,
          await edgeAndFill(setup, ".ui-choice-card", t.setup.pathNew),
          `${scheme} hovered vs chosen card`,
        );
        await clickElement(setup, "button", { text: t.setup.back });
      }
    } finally {
      await browser.close();
    }
  },
);
