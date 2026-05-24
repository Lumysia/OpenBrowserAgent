import {
  BROWSER_TOOL_TIMEOUT_MS,
  BROWSER_WAIT_DEFAULT_MS,
  BROWSER_WAIT_MAX_MS,
  MARKDOWN_FILENAME_MAX_LENGTH,
  TAB_LOAD_WAIT_TIMEOUT_MS,
} from "../shared/config";
import { BROWSER_TOOL_NAME, UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import {
  getActiveBrowserTab,
  isScriptableUrl,
  resolveBrowserTabId,
} from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import { downloadTextFile, findImages, safeFileName } from "./downloads";
import { findAccessibleElements } from "./accessible-elements";
import { clickElement } from "./browser-input";
import { executeCdpTool, isCdpTool } from "./cdp-tools";
import { allBrowserTools, browserTools } from "./tool-schema";
import { withContentSlice, withListSlice, withTimeout } from "./tool-utils";

export { allBrowserTools, browserTools };
const WAIT_FOR_TEXT_DEFAULT_MS = 5000;
const WAIT_FOR_TEXT_POLL_MS = 250;

async function executeBrowserTool(
  name: string | undefined,
  args: Record<string, unknown>,
) {
  if (isCdpTool(name)) return executeCdpTool(name, args);
  const api = getBrowserApi();
  switch (name) {
    case BROWSER_TOOL_NAME.wait: {
      const milliseconds = clampWaitMs(args.milliseconds ?? args.ms);
      await wait(milliseconds);
      return { success: true, milliseconds };
    }
    case BROWSER_TOOL_NAME.getCurrentTime: {
      return getCurrentTime(args);
    }
    case BROWSER_TOOL_NAME.getCurrentTab: {
      const tab = await getActiveBrowserTab();
      if (!tab) return { error: TOOL_ERROR.noActiveWebTabFound };
      return tab.url?.startsWith("http")
        ? { tabId: tab.id, title: tab.title, url: tab.url }
        : { error: TOOL_ERROR.activeTabNotWebPage };
    }
    case BROWSER_TOOL_NAME.openNewTabWithURL: {
      const tab = await api.tabs.create({
        url: String(args.url || ""),
        active: false,
      });
      if (tab.id) {
        await waitTabComplete(tab.id);
        const loadedTab = await api.tabs.get(tab.id);
        return {
          tab: { id: loadedTab.id, url: loadedTab.url, title: loadedTab.title },
        };
      }
      return { tab: { id: tab.id } };
    }
    case BROWSER_TOOL_NAME.getAllTabs: {
      const tabs = await api.tabs.query({});
      return withListSlice(
        {},
        tabs.map((tab) => ({ id: tab.id, title: tab.title })),
        args,
        "tabs",
      );
    }
    case BROWSER_TOOL_NAME.closeTab: {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds.map(Number).filter(Number.isFinite)
        : [Number(args.tabId)].filter(Number.isFinite);
      if (!tabIds.length)
        return { success: false, error: TOOL_ERROR.noTabIdsProvided };
      await api.tabs.remove(tabIds);
      return { success: true, tabIds };
    }
    case BROWSER_TOOL_NAME.reloadTab: {
      const tabId = await resolveTabId(args.tabId);
      const bypassCache =
        args.bypassCache === true || args.ignoreCache === true;
      await api.tabs.reload(tabId, { bypassCache });
      await wait(100);
      await waitTabComplete(tabId);
      return { success: true, tabId, bypassCache };
    }
    case BROWSER_TOOL_NAME.navigateTab: {
      return navigateTab(args);
    }
    case BROWSER_TOOL_NAME.captureVisibleTab: {
      return captureVisibleTab(args);
    }
    case BROWSER_TOOL_NAME.waitForText: {
      return waitForText(args);
    }
    case BROWSER_TOOL_NAME.goToTab: {
      const tab = await api.tabs.update(await resolveTabId(args.tabId), {
        active: true,
      });
      if (!tab) return { success: false, error: TOOL_ERROR.tabNotFound };
      if (tab.windowId !== undefined)
        await api.windows.update(tab.windowId, { focused: true });
      return { success: true };
    }
    case BROWSER_TOOL_NAME.insertCSSToTab: {
      await api.scripting.insertCSS({
        target: { tabId: await resolveTabId(args.tabId) },
        css: String(args.css || ""),
      });
      return { success: true };
    }
    case BROWSER_TOOL_NAME.removeCSSToTab: {
      await api.scripting.removeCSS({
        target: { tabId: await resolveTabId(args.tabId) },
        css: String(args.css || ""),
      });
      return { success: true };
    }
    case BROWSER_TOOL_NAME.openSearchTab: {
      const query = String(args.query || "");
      const tab = await openDefaultSearchTab(query);
      return {
        success: true,
        tabId: tab?.id,
        tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : undefined,
      };
    }
    case BROWSER_TOOL_NAME.waitTabLoadFinished: {
      const tabId = await resolveTabId(args.tabId);
      await waitTabComplete(tabId);
      return { success: true, tabId };
    }
    case BROWSER_TOOL_NAME.getTabContent: {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds
            .map(Number)
            .filter((tabId) => Number.isFinite(tabId) && tabId > 0)
        : [await resolveTabId(args.tabId)];
      const contents = [];
      for (const tabId of tabIds) {
        const tab = await api.tabs.get(tabId);
        const markdown = isScriptableUrl(tab.url)
          ? await extractMarkdown(tabId)
          : "";
        contents.push(
          withContentSlice(
            {
              tabId,
              title: tab.title || "",
              url: tab.url || "",
            },
            markdown,
            args,
            "markdown",
          ),
        );
      }
      return { contents };
    }
    case BROWSER_TOOL_NAME.findAccessableElementsFromTab: {
      return withListSlice(
        {},
        await findAccessibleElements(await resolveTabId(args.tabId)),
        args,
        "elements",
      );
    }
    case BROWSER_TOOL_NAME.getElementPropertiesByAiID: {
      const ids = Array.isArray(args.ids)
        ? args.ids.map(String)
        : [String(args.id || "")].filter(Boolean);
      return getElementProperties(await resolveTabId(args.tabId), ids);
    }
    case BROWSER_TOOL_NAME.clickElementByAiID: {
      return clickElement(
        await resolveTabId(args.tabId),
        String(args.id || ""),
      );
    }
    case BROWSER_TOOL_NAME.inputTextByAiID: {
      return inputElement(
        await resolveTabId(args.tabId),
        String(args.id || ""),
        String(args.text || ""),
      );
    }
    case BROWSER_TOOL_NAME.groupTabs: {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds.map(Number).filter(Number.isFinite)
        : [];
      if (!tabIds.length)
        return { success: false, error: TOOL_ERROR.noTabIdsProvided };
      const color = String(
        args.color || "cyan",
      ) as chrome.tabGroups.UpdateProperties["color"];
      const title = String(args.title || "");
      const tabs = await Promise.all(
        tabIds.map((tabId) => api.tabs.get(tabId).catch(() => undefined)),
      );
      const normalTabs = [];
      const skippedTabIds = [];

      for (const tab of tabs) {
        if (!tab?.id || tab.windowId === undefined) continue;
        const window = await api.windows
          .get(tab.windowId)
          .catch(() => undefined);
        if (window?.type === "normal") normalTabs.push(tab);
        else skippedTabIds.push(tab.id);
      }

      if (!normalTabs.length)
        return {
          success: false,
          error: TOOL_ERROR.noGroupableNormalTabs,
          skippedTabIds,
        };

      const tabsByWindow = new Map<number, number[]>();
      for (const tab of normalTabs) {
        const windowTabs = tabsByWindow.get(tab.windowId!) || [];
        windowTabs.push(tab.id!);
        tabsByWindow.set(tab.windowId!, windowTabs);
      }

      const groupIds = [];
      for (const windowTabIds of tabsByWindow.values()) {
        const groupId = await api.tabs.group({
          tabIds: windowTabIds as [number, ...number[]],
        });
        await api.tabGroups.update(groupId, { title, color });
        groupIds.push(groupId);
      }

      return { success: true, groupIds, skippedTabIds };
    }
    case BROWSER_TOOL_NAME.scrollToBottom: {
      await scrollToBottom(await resolveTabId(args.tabId));
      return { success: true };
    }
    case BROWSER_TOOL_NAME.downloadTabToMarkdown: {
      const tabId = await resolveTabId(args.tabId);
      const tab = await api.tabs.get(tabId);
      const markdown = await extractMarkdown(tabId);
      const filename = `${safeFileName(tab.title || tab.url || "tab").slice(0, MARKDOWN_FILENAME_MAX_LENGTH)}.md`;
      await downloadTextFile(filename, markdown, "text/markdown;charset=utf-8");
      return { success: true, filename };
    }
    case BROWSER_TOOL_NAME.downloadAllImagesInTab: {
      return findImages(await resolveTabId(args.tabId));
    }
    default:
      return { error: TOOL_ERROR.unknownTool, toolName: name };
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) =>
    globalThis.setTimeout(resolve, milliseconds),
  );
}

function clampWaitMs(value: unknown) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    return BROWSER_WAIT_DEFAULT_MS;
  return Math.min(BROWSER_WAIT_MAX_MS, Math.trunc(milliseconds));
}

function getCurrentTime(args: Record<string, unknown>) {
  const now = new Date();
  const locale = String(args.locale || navigator.language || "en-US");
  const requestedTimeZone = String(args.timeZone || "").trim();
  const timeZone = requestedTimeZone || currentTimeZone();
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "full",
    timeStyle: "long",
    timeZone,
  };
  try {
    return {
      timestamp: now.getTime(),
      iso: now.toISOString(),
      locale,
      timeZone,
      localDateTime: new Intl.DateTimeFormat(locale, options).format(now),
      date: new Intl.DateTimeFormat(locale, {
        dateStyle: "full",
        timeZone,
      }).format(now),
      time: new Intl.DateTimeFormat(locale, {
        timeStyle: "long",
        timeZone,
      }).format(now),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      requestedTimeZone,
      locale,
    };
  }
}

function currentTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function navigateTab(args: Record<string, unknown>) {
  const api = getBrowserApi();
  const tabId = await resolveTabId(args.tabId);
  const type = String(args.type || (args.url ? "url" : "reload"));
  if (type === "back") await api.tabs.goBack(tabId);
  else if (type === "forward") await api.tabs.goForward(tabId);
  else if (type === "url") {
    const url = String(args.url || "").trim();
    if (!url) return { success: false, error: TOOL_ERROR.missingUrl };
    await api.tabs.update(tabId, { url });
  } else if (type === "reload") {
    const bypassCache = args.bypassCache === true || args.ignoreCache === true;
    await api.tabs.reload(tabId, { bypassCache });
  } else {
    return { success: false, error: TOOL_ERROR.unknownNavigationType, type };
  }
  await wait(100);
  await waitTabComplete(tabId);
  return { success: true, tabId, type };
}

async function captureVisibleTab(args: Record<string, unknown>) {
  const api = getBrowserApi();
  const tabId = await resolveTabId(args.tabId);
  const tab = await api.tabs.get(tabId);
  if (tab.windowId === undefined)
    return { success: false, error: TOOL_ERROR.tabHasNoWindow };
  await api.tabs.update(tabId, { active: true });
  await api.windows.update(tab.windowId, { focused: true });
  const format = String(args.format || "png") === "jpeg" ? "jpeg" : "png";
  const quality = Number(args.quality);
  const image = await api.tabs.captureVisibleTab(tab.windowId, {
    format,
    ...(format === "jpeg" && Number.isFinite(quality)
      ? { quality: Math.min(100, Math.max(0, Math.trunc(quality))) }
      : {}),
  });
  return {
    success: true,
    tabId,
    format,
    image,
    _visionImage: { dataUrl: image, type: `image/${format}` },
    note: "Screenshot pixels will be sent to the next model call as a vision image.",
  };
}

async function waitForText(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const texts = (Array.isArray(args.text) ? args.text : [args.text])
    .map((text) => String(text || "").trim())
    .filter(Boolean);
  if (!texts.length)
    return { success: false, error: TOOL_ERROR.noTextProvided };
  const timeout = clampTimeoutMs(args.timeout, WAIT_FOR_TEXT_DEFAULT_MS);
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = await pageContainsText(tabId, texts);
    if (found) return { success: true, tabId, text: found };
    await wait(WAIT_FOR_TEXT_POLL_MS);
  }
  return { success: false, tabId, error: TOOL_ERROR.timedOutWaitingForText };
}

async function pageContainsText(tabId: number, texts: string[]) {
  const [result] = await getBrowserApi().scripting.executeScript({
    target: { tabId },
    args: [texts],
    func: (needles) => {
      const pageText = document.body?.innerText || "";
      return needles.find((text) => pageText.includes(text)) || "";
    },
  });
  return String(result.result || "");
}

function clampTimeoutMs(value: unknown, fallback: number) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return fallback;
  return Math.min(60_000, Math.trunc(milliseconds));
}

export async function safeExecuteBrowserTool(
  name: string | undefined,
  args: Record<string, unknown>,
) {
  try {
    return await withTimeout(
      executeBrowserTool(name, args),
      BROWSER_TOOL_TIMEOUT_MS,
      `Tool timed out: ${name || UNKNOWN_TOOL_NAME}`,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function resolveTabId(value: unknown) {
  return resolveBrowserTabId(value);
}

async function extractMarkdown(tabId: number) {
  const [result] = await getBrowserApi().scripting.executeScript({
    target: { tabId },
    func: () =>
      `# ${document.title}\n\nURL: ${location.href}\n\n${document.body?.innerText || ""}`,
  });
  return String(result.result || "");
}

async function getElementProperties(tabId: number, ids: string[]) {
  const [result] = await getBrowserApi().scripting.executeScript({
    target: { tabId },
    args: [ids],
    func: (aiIds) => {
      return aiIds.map((aiId) => {
        const element = document.querySelector(`[data-ai-id="${aiId}"]`) as
          | HTMLAnchorElement
          | HTMLImageElement
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (!element) return null;
        const properties: Record<string, unknown> = {
          aiId: element.getAttribute("data-ai-id"),
        };
        if (element.tagName.toLowerCase() === "img")
          properties.src = (element as HTMLImageElement).src;
        else if (element.tagName.toLowerCase() === "a")
          properties.href = (element as HTMLAnchorElement).href;
        else if (
          element.tagName.toLowerCase() === "input" ||
          element.tagName.toLowerCase() === "textarea"
        )
          properties.value = (
            element as HTMLInputElement | HTMLTextAreaElement
          ).value;
        return properties;
      });
    },
  });
  return result.result ?? [];
}

async function inputElement(tabId: number, id: string, text: string) {
  const [result] = await getBrowserApi().scripting.executeScript({
    target: { tabId },
    args: [id, text, TOOL_ERROR.elementNotTextInput],
    func: (aiId, value, elementNotTextInput) => {
      const element = document.querySelector(
        `[data-ai-id="${CSS.escape(aiId)}"]`,
      ) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
      if (!element) return { success: false };
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        (element as HTMLInputElement | HTMLTextAreaElement).value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return { success: true };
      }
      if (element.hasAttribute("contenteditable")) {
        element.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand("delete", false);
        if (!document.execCommand("insertText", false, value)) {
          element.textContent = value;
          const endRange = document.createRange();
          endRange.selectNodeContents(element);
          endRange.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(endRange);
        }
        for (const eventName of [
          "input",
          "change",
          "keydown",
          "keyup",
          "keypress",
          "textInput",
          "compositionend",
          "blur",
        ]) {
          let event: Event;
          if (eventName.startsWith("key"))
            event = new KeyboardEvent(eventName, {
              bubbles: true,
              cancelable: true,
              key: "Unidentified",
              code: "Unidentified",
            });
          else if (eventName === "textInput")
            event = new CompositionEvent(eventName, {
              bubbles: true,
              data: value,
            });
          else event = new Event(eventName, { bubbles: true });
          element.dispatchEvent(event);
        }
        const inputEvent = new Event("input", { bubbles: true });
        Object.defineProperty(inputEvent, "target", { value: element });
        Object.defineProperty(inputEvent, "currentTarget", { value: element });
        element.dispatchEvent(inputEvent);
        return { success: true };
      }
      return {
        success: false,
        error: elementNotTextInput,
      };
    },
  });
  return { ...(result.result || { success: false }), tabId };
}

async function scrollToBottom(tabId: number) {
  await getBrowserApi().scripting.executeScript({
    target: { tabId },
    func: () => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      window.scrollTo({ top: scrollHeight, behavior: "smooth" });
      return { scrollHeight };
    },
  });
}

async function openDefaultSearchTab(query: string) {
  const api = getBrowserApi();
  const beforeTabs = await api.tabs.query({});
  const beforeIds = new Set(beforeTabs.map((tab) => tab.id).filter(Boolean));
  await api.search.query({ text: query, disposition: "NEW_TAB" });
  const afterTabs = await api.tabs.query({});
  return (
    afterTabs.find((tab) => tab.id && !beforeIds.has(tab.id)) ||
    afterTabs.find((tab) => tab.active) ||
    null
  );
}

async function waitTabComplete(tabId: number) {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  if (tab.status === "complete") return;
  await new Promise<void>((resolve) => {
    const listener = (
      changedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (changedTabId === tabId && changeInfo.status === "complete") {
        api.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    api.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      api.tabs.onUpdated.removeListener(listener);
      resolve();
    }, TAB_LOAD_WAIT_TIMEOUT_MS);
  });
}
