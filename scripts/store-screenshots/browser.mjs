import { setTimeout as delay } from "node:timers/promises";
import {
  clickElement,
  movePointer,
  pointerScale,
  pressKey,
  typeText,
} from "../../tests/cdp-input.mjs";
import { launchExtension, poll } from "../../tests/chromium.mjs";
import { useFonts } from "./fonts.mjs";

export { delay, poll };

export const FRAME = { width: 1280, height: 800 };
// The side panel is captured as a tab at browser zoom, so a whole exchange
// fits the frame; the page fills the rest, left of a 1px divider.
export const PANEL = { width: 440, height: 800, zoom: 0.8 };
export const PAGE = { width: 839, height: 800 };

// A headless Chromium with the built extension, its UI language set to
// `locale`, and the fonts for that locale.
export async function launch(locale) {
  const restoreFonts = await useFonts(locale);
  try {
    const chromium = await launchExtension({
      headed: false,
      args: [
        "--force-device-scale-factor=1",
        `--window-size=${FRAME.width},${FRAME.height}`,
        `--lang=${locale}`,
        "--hide-scrollbars",
        // The side panel runs in a background tab; keep it rendering.
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--disable-background-timer-throttling",
      ],
    });
    return {
      ...chromium,
      async close() {
        await chromium.close();
        await restoreFonts();
      },
    };
  } catch (error) {
    await restoreFonts();
    throw error;
  }
}

export function extensionUrl(chromium, page) {
  return `chrome-extension://${chromium.id}/${page}`;
}

export async function size(page, { width, height }) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

// Captures the viewport. A capture of a background tab can stall, so a
// slow one is retried once.
export async function capture(page, attempts = 2) {
  const request = page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  request.catch(() => {});
  const timeout = delay(30000, null, { ref: false });
  const result = await Promise.race([request, timeout]);
  if (result) return Buffer.from(result.data, "base64");
  if (attempts > 1) return capture(page, attempts - 1);
  throw new Error("Screenshot capture timed out");
}

// Opens `url` in a foreground tab and answers it with `html`, through CDP
// request interception, so demo pages show a believable address.
export async function openDemo(chromium, url, html) {
  const page = await chromium.open("about:blank");
  const { origin } = new URL(url);
  page.on("Fetch.requestPaused", ({ requestId, request }) => {
    const found = new URL(request.url).href === url;
    page.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: found ? 200 : 404,
      responseHeaders: [
        { name: "Content-Type", value: "text/html; charset=utf-8" },
      ],
      body: Buffer.from(found ? html : "").toString("base64"),
    });
  });
  await page.send("Fetch.enable", {
    patterns: [{ urlPattern: `${origin}/*` }],
  });
  await page.send("Page.navigate", { url });
  await poll(() =>
    page.call(
      (expected) =>
        location.href === expected && document.readyState === "complete",
      url,
    ),
  );
  await page.call(() => document.fonts.ready.then(() => true));
  return page;
}

// Formats dates and numbers the way a browser set to `locale` does; the UI
// language itself comes from stored settings.
export async function useLocale(page, locale) {
  await page.send("Emulation.setLocaleOverride", { locale });
}

// Opens the side panel as a background tab at the panel size and zoom.
export async function openPanel(chromium, locale) {
  const panel = await chromium.open(extensionUrl(chromium, "sidepanel.html"), {
    background: true,
  });
  await useLocale(panel, locale);
  await panel.send("Page.reload");
  await delay(500);
  await poll(() =>
    panel.call(
      () => typeof globalThis.chrome?.storage?.local?.set === "function",
    ),
  );
  await size(panel, PANEL);
  await panel.call(
    async (zoom) =>
      chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, zoom),
    PANEL.zoom,
  );
  await poll(
    () => panel.call(() => !!document.querySelector(".composer-box textarea")),
    30000,
  );
  await delay(1200);
  return panel;
}

// Waits until the page's visible text includes `text`.
export function waitForText(page, text, timeout = 60000) {
  return poll(
    () => page.call((value) => document.body.innerText.includes(value), text),
    timeout,
  );
}

// A real mouse click on the first element that matches `selector` and, if
// given, contains `text`, at the page's zoom.
export async function click(page, selector, text) {
  await clickElement(page, selector, {
    text,
    scale: await pointerScale(page),
  });
}

export const type = (page, selector, text) => typeText(page, text, selector);

export const enter = (page) => pressKey(page, "Enter");

// Moves the pointer off the UI and passes focus through the composer and
// out, which closes focus tooltips, then lets transitions finish.
export async function settle(page) {
  await movePointer(page, { x: 1, y: FRAME.height - 1 });
  await page.call(() => {
    document.activeElement?.blur();
    document.querySelector(".composer-box textarea")?.focus();
  });
  await delay(300);
  await page.call(() => document.activeElement?.blur());
  await delay(1500);
}

// Width, height and PNG color type from the IHDR chunk.
export function pngHeader(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    depth: buffer[24],
    colorType: buffer[25],
  };
}
