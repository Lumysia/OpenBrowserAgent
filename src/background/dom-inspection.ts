import { isScriptableUrl } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import { delay } from "../shared/cancellation";
import { inspectPageInDom } from "./dom-inspection-in-page";
import {
  injectPageDom,
  objectInput,
  readPageTarget,
  stringInput,
} from "./page-dom";
import { withContentSlice, withListSlice } from "./tool-utils";

const DEFAULT_CONTEXT_DEPTH_UP = 6;
const DEFAULT_CONTEXT_DEPTH_DOWN = 4;
const DEFAULT_SIBLING_LIMIT = 3;
const DEFAULT_ITEM_LIMIT = 30;
const DEFAULT_TEXT_LIMIT = 6_000;
const WAIT_POLL_MS = 250;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;

export type InspectOptions = ReturnType<typeof buildInspectOptions>;

export async function inspectPage(
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const api = getBrowserApi();
  const tabIds = Array.isArray(args.tabIds)
    ? args.tabIds
        .map(Number)
        .filter((tabId) => Number.isFinite(tabId) && tabId > 0)
    : [Number(args.tabId)].filter(
        (tabId) => Number.isFinite(tabId) && tabId > 0,
      );
  if (!tabIds.length) return { error: TOOL_ERROR.noTabIdsProvided };

  const pages = [];
  const options = buildInspectOptions(args);
  for (const tabId of tabIds) {
    signal?.throwIfAborted();
    try {
      const tab = await api.tabs.get(tabId);
      if (!isScriptableUrl(tab.url)) {
        pages.push({
          success: false,
          error: TOOL_ERROR.activeTabNotWebPage,
          tabId,
          title: tab.title || "",
          url: tab.url || "",
        });
        continue;
      }
      const waitResult = await waitForInspectablePage(
        tabId,
        options.waitFor,
        signal,
      );
      if (waitResult?.success === false) {
        pages.push({
          ...waitResult,
          tabId,
          title: tab.title || "",
          url: tab.url || "",
        });
        continue;
      }
      await injectPageDom(tabId);
      const [result] = await api.scripting.executeScript({
        target: { tabId },
        args: [options],
        func: inspectPageInDom,
      });
      const page = (result.result || {}) as Record<string, unknown>;
      pages.push({
        ...page,
        success: page.success !== false,
        tabId,
        title: tab.title || String(page.title || ""),
        url: tab.url || String(page.url || ""),
      });
    } catch (error) {
      pages.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tabId,
      });
    }
  }

  return {
    success: pages.some((page) => page.success !== false),
    pages: pages.map((page) => slicePage(page, options)),
  };
}

function buildInspectOptions(args: Record<string, unknown>) {
  const waitFor = objectInput(args.waitFor);
  return {
    include: stringArray(args.include),
    target: readPageTarget(args),
    depthUp: positiveInteger(args.depthUp, DEFAULT_CONTEXT_DEPTH_UP),
    depthDown: positiveInteger(args.depthDown, DEFAULT_CONTEXT_DEPTH_DOWN),
    siblingLimit: positiveInteger(args.siblingLimit, DEFAULT_SIBLING_LIMIT),
    itemOffset: positiveInteger(args.itemOffset ?? args.offset, 0),
    itemLimit: positiveInteger(args.itemLimit, DEFAULT_ITEM_LIMIT),
    textOffset: positiveInteger(args.textOffset ?? args.offset, 0),
    textLimit: positiveInteger(
      args.textLimit ?? args.limit,
      DEFAULT_TEXT_LIMIT,
    ),
    waitFor: {
      text: stringArray(waitFor.text),
      selector: stringInput(waitFor.selector),
      timeout: positiveInteger(waitFor.timeout ?? args.timeout, 0),
      pollMs: positiveInteger(waitFor.pollMs, WAIT_POLL_MS),
    },
  };
}

function stringArray(value: unknown) {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.trunc(number);
}

async function waitForInspectablePage(
  tabId: number,
  waitFor: InspectOptions["waitFor"],
  signal?: AbortSignal,
) {
  if (!waitFor.text.length && !waitFor.selector) return undefined;
  const timeout = waitFor.timeout || DEFAULT_WAIT_TIMEOUT_MS;
  const started = Date.now();
  while (Date.now() - started <= timeout) {
    const [result] = await getBrowserApi().scripting.executeScript({
      target: { tabId },
      args: [waitFor],
      func: (condition) => {
        const selectorFound = condition.selector
          ? Boolean(document.querySelector(condition.selector))
          : false;
        const pageText = document.body?.innerText || "";
        const textFound = condition.text.find((text) =>
          pageText.includes(text),
        );
        return { selectorFound, textFound };
      },
    });
    const found = (result.result || {}) as {
      selectorFound?: boolean;
      textFound?: string;
    };
    if (found.selectorFound || found.textFound)
      return { success: true, waitForFound: found };
    await delay(
      Math.min(waitFor.pollMs, Math.max(0, timeout - (Date.now() - started))),
      signal,
    );
  }
  const error = waitFor.selector
    ? waitFor.text.length
      ? TOOL_ERROR.timedOutWaitingForCondition
      : TOOL_ERROR.timedOutWaitingForSelector
    : TOOL_ERROR.timedOutWaitingForText;
  return {
    success: false,
    error,
    waitedFor: {
      selector: waitFor.selector || undefined,
      text: waitFor.text.length ? waitFor.text : undefined,
      timeout,
    },
  };
}

// Page the markdown and each list by the requested offsets and limits.
function slicePage(page: Record<string, unknown>, options: InspectOptions) {
  let sliced: Record<string, unknown> = withContentSlice(
    page,
    String(page.markdown || ""),
    { offset: options.textOffset, limit: options.textLimit },
    "markdown",
  );
  const items = { offset: options.itemOffset, limit: options.itemLimit };
  for (const field of ["elements", "images", "links", "forms", "blocks"])
    if (Array.isArray(page[field]))
      sliced = withListSlice(sliced, page[field], items, field);
  return sliced;
}
