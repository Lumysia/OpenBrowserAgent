import { delay, withCancellationTimeout } from "../../shared/cancellation";
import { DEFAULT_SCREENSHOT_QUALITY } from "../../shared/config";
import { areCdpAvailable } from "../../shared/runtime-capabilities";
import { getBrowserApi } from "../../shared/browser-api";
import { TOOL_NAME } from "../../shared/tool-names";
import { withCdp, type CdpSend } from "../cdp";
import { callPage } from "../page-agent";
import { RUN_TAB_ID_PARAM } from "../run-tab";
import {
  cropCapture,
  cropZoom,
  elementBox,
  imageWidth,
  MAX_ZOOM,
  visibleBox,
  type Box,
} from "./screenshot-crop";
import { fail, schema, type ToolDefinition, type ToolResult } from "./types";

// Screenshots never take the user's tab or window: the debugger and
// Firefox's captureTab capture a tab in the background. Only a browser with
// neither (Safari), or a background capture that failed, shows the tab for
// the capture, then puts the user's tab back; never in a run nobody watches
// (a scheduled task), which fails instead.

// Longest edge of a full-page screenshot; vision models scale larger images
// down anyway.
const FULL_PAGE_MAX_EDGE = 8_000;
const BACKGROUND_CAPTURE_TIMEOUT_MS = 10_000;
const CAPTURE_RETRY_MS = 1_000;
const CAPTURE_ATTEMPTS = 8;
// Time for a tab brought to the front to paint before the capture.
const FOREGROUND_PAINT_MS = 150;
const JPEG = { format: "jpeg", quality: DEFAULT_SCREENSHOT_QUALITY } as const;

type Tab = chrome.tabs.Tab & { id: number };
type Capture = { image: string; note?: string };
type CaptureTab = (
  tabId: number,
  options: { format: string; quality: number },
) => Promise<string>;

export const screenshotTool: ToolDefinition = {
  name: TOOL_NAME.screenshot,
  effects: "read",
  group: "pages",
  summary: "Image of a tab",
  description:
    "See a tab as an image, without bringing it to the front: the visible part, or fullPage: true for the whole page through the Chrome debugger. Use it only when the layout or visuals matter; snapshot is cheaper for text and controls.",
  parameters: schema({
    tabId: RUN_TAB_ID_PARAM,
    fullPage: { type: "boolean" },
    ref: {
      type: "string",
      description:
        "Only this element (scrolled into view), with a small margin.",
    },
    region: {
      type: "object",
      description: "Only this part of the viewport, in CSS pixels.",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["x", "y", "width", "height"],
    },
    zoom: {
      type: "number",
      description: `Enlarges a ref or region crop, 1 to ${MAX_ZOOM} (default 1), to see small details.`,
    },
  }),
  async execute(input, { run, signal }) {
    const tab = await run.tab.target(input.tabId);
    const showTab = !run.unattended;
    if (input.ref !== undefined || input.region !== undefined)
      return croppedShot(tab, input, showTab, signal);
    if (input.fullPage === true) return fullPageShot(tab, signal);
    const capture = await visibleShot(tab, showTab, signal);
    if (!capture) return fail(NO_BACKGROUND_CAPTURE);
    const { image, note } = capture;
    return {
      text: `Screenshot of tab ${tab.id} (${tab.title || tab.url}) attached.${note ? ` ${note}` : ""}`,
      details: {
        tabId: tab.id,
        title: tab.title,
        url: tab.url,
        image,
        format: "jpeg",
      },
      image: { dataUrl: image, type: "image/jpeg" },
    };
  },
};

const NO_BACKGROUND_CAPTURE =
  "The tab could not be captured in the background, and this run runs on its own, so it never brings a tab to the front. Use snapshot or read for the page's content.";

// The visible part; `showTab`: the tab may be shown for a moment when it
// cannot be captured where it is (else undefined).
async function visibleShot(
  tab: Tab,
  showTab: boolean,
  signal?: AbortSignal,
): Promise<Capture | undefined> {
  const background = await backgroundShot(tab, signal);
  if (background) return { image: background };
  return showTab ? foregroundShot(tab, signal) : undefined;
}

// The tab's viewport, captured where it is. Undefined when the browser
// cannot (no debugger or captureTab, or a page the debugger may not attach
// to).
async function backgroundShot(tab: Tab, signal?: AbortSignal) {
  const captureTab = (
    getBrowserApi().tabs as typeof chrome.tabs & { captureTab?: CaptureTab }
  ).captureTab;
  try {
    return await withCancellationTimeout(
      async (bounded) => {
        if (areCdpAvailable())
          return withCdp({ tabId: tab.id }, captureViewport, bounded);
        if (captureTab) return captureTab(tab.id, JPEG);
        return undefined;
      },
      BACKGROUND_CAPTURE_TIMEOUT_MS,
      "The background capture timed out.",
      signal,
    );
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
}

// A tab in the background has no frame to capture until Chromium makes one
// for the capture, and it may answer only a repeated request: the request
// is repeated until one is answered (or the caller's time runs out, which
// rejects the pending ones).
function captureViewport(
  send: CdpSend,
  params: Record<string, unknown> = JPEG,
) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let attempts = 0;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      finish();
    };
    const attempt = () => {
      if (++attempts >= CAPTURE_ATTEMPTS) clearInterval(timer);
      send("Page.captureScreenshot", params).then(
        ({ data }) => settle(() => resolve(`data:image/jpeg;base64,${data}`)),
        (error) => settle(() => reject(error)),
      );
    };
    const timer = setInterval(attempt, CAPTURE_RETRY_MS);
    attempt();
  });
}

// Shows the tab in its window (without focusing the window), captures it,
// and gives the window its tab back unless the user moved on meanwhile.
async function foregroundShot(
  tab: Tab,
  signal?: AbortSignal,
): Promise<Capture> {
  const api = getBrowserApi();
  const [previous] = await api.tabs.query({
    active: true,
    windowId: tab.windowId,
  });
  const previousId = previous?.id;
  const shown = previousId !== undefined && previousId !== tab.id;
  if (shown) {
    await api.tabs.update(tab.id, { active: true });
    await delay(FOREGROUND_PAINT_MS);
  }
  try {
    signal?.throwIfAborted();
    const image = await api.tabs.captureVisibleTab(tab.windowId, JPEG);
    return {
      image,
      note: shown
        ? "This browser can only capture the tab in front, so the tab was shown for a moment and the user's tab was put back."
        : undefined,
    };
  } finally {
    if (shown && (await api.tabs.get(tab.id).catch(() => undefined))?.active)
      await api.tabs
        .update(previousId, { active: true })
        .catch(() => undefined);
  }
}

async function fullPageShot(
  tab: Tab,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (!areCdpAvailable())
    return fail(
      "Full-page screenshots need the Chrome debugger, which this browser lacks. Take the visible part and scroll.",
    );
  const { image, width, height, scale } = await withCdp(
    { tabId: tab.id },
    async (send) => {
      const metrics = await send("Page.getLayoutMetrics");
      const size = metrics.cssContentSize || metrics.contentSize;
      const width = Math.ceil(size.width);
      const height = Math.ceil(size.height);
      const scale = Math.min(1, FULL_PAGE_MAX_EDGE / Math.max(width, height));
      const { data } = await send("Page.captureScreenshot", {
        ...JPEG,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale },
      });
      return { image: `data:image/jpeg;base64,${data}`, width, height, scale };
    },
    signal,
  );
  return {
    text: `Full-page screenshot of tab ${tab.id} (${tab.title || tab.url}, ${width}x${height} px${scale < 1 ? `, scaled to ${Math.round(scale * 100)}%` : ""}) attached.`,
    details: {
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      image,
      format: "jpeg",
    },
    image: { dataUrl: image, type: "image/jpeg" },
  };
}

type Viewport = { width: number; height: number };

// One element or region of the viewport. The debugger captures just that
// part at the zoom asked; without it, the visible capture is cropped.
async function croppedShot(
  tab: Tab,
  input: Record<string, unknown>,
  showTab: boolean,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  const { value } = await callPage<{ viewport: Viewport; rect?: Box }>(
    tab.id,
    "box",
    ref ? { ref } : {},
    signal,
  );
  const region = input.region as Partial<Box> | undefined;
  const asked = ref
    ? value.rect
    : region &&
        [region.x, region.y, region.width, region.height].every(
          (part) => typeof part === "number" && Number.isFinite(part),
        )
      ? (region as Box)
      : undefined;
  if (!asked)
    return fail(
      "region needs x, y, width and height in CSS pixels of the viewport.",
    );
  const box = ref
    ? elementBox(asked, value.viewport)
    : visibleBox(asked, value.viewport);
  if (!box)
    return fail(
      `${ref ? `${ref} has no visible box` : "That region is outside the viewport"} (viewport ${value.viewport.width}x${value.viewport.height} CSS px). Take a snapshot or a plain screenshot.`,
    );
  const zoom = cropZoom(input.zoom, box);
  let image = await debuggerCrop(tab, box, zoom, signal);
  if (!image) {
    if (typeof OffscreenCanvas === "undefined")
      return fail(
        "This browser can't crop screenshots. Take a plain screenshot of the visible part.",
      );
    const capture = await visibleShot(tab, showTab, signal);
    if (!capture) return fail(NO_BACKGROUND_CAPTURE);
    image = await cropCapture(capture.image, box, value.viewport.width, zoom);
  }
  // What one CSS pixel became, read from the image itself.
  const scale = Math.round(((await imageWidth(image)) / box.width) * 100) / 100;
  const per = scale === 1 ? "" : `/${scale}`;
  return {
    text: `Screenshot of ${ref || "a region"} in tab ${tab.id} (${tab.title || tab.url}) attached: viewport x=${box.x} y=${box.y}, ${box.width}x${box.height} CSS px, at ${scale}x. Image point (a, b) is viewport point (${box.x} + a${per}, ${box.y} + b${per}), for act click x,y.`,
    details: {
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      image,
      format: "jpeg",
      box,
      scale,
    },
    image: { dataUrl: image, type: "image/jpeg" },
  };
}

// The region through the debugger, in page coordinates; undefined where
// the debugger can't capture.
async function debuggerCrop(
  tab: Tab,
  box: Box,
  zoom: number,
  signal?: AbortSignal,
) {
  if (!areCdpAvailable()) return undefined;
  try {
    return await withCancellationTimeout(
      (bounded) =>
        withCdp(
          { tabId: tab.id },
          async (send) => {
            const metrics = await send("Page.getLayoutMetrics");
            const { pageX = 0, pageY = 0 } = metrics.cssVisualViewport || {};
            return captureViewport(send, {
              ...JPEG,
              clip: { ...box, x: box.x + pageX, y: box.y + pageY, scale: zoom },
            });
          },
          bounded,
        ),
      BACKGROUND_CAPTURE_TIMEOUT_MS,
      "The background capture timed out.",
      signal,
    );
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
}
