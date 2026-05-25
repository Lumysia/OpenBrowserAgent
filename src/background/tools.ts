import {
  BROWSER_TOOL_TIMEOUT_MS,
  BROWSER_WAIT_DEFAULT_MS,
  BROWSER_WAIT_MAX_MS,
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_SCREENSHOT_QUALITY,
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
import { executeCdpTool, isCdpTool } from "./cdp-tools";
import { inspectPage } from "./dom-inspection";
import { mutatePage } from "./page-mutation";
import { allBrowserTools, browserTools } from "./tool-schema";
import { withListSlice, withTimeout } from "./tool-utils";

export { allBrowserTools, browserTools };

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
      return isScriptableUrl(tab.url)
        ? { tabId: tab.id, title: tab.title, url: tab.url }
        : {
            error: TOOL_ERROR.activeTabNotWebPage,
            title: tab.title,
            url: tab.url,
            guidance:
              "The active tab is not a normal readable page. Use manageTabs operation=list to find an http(s) tab, focus it with manageTabs operation=focus, or open a web page first.",
          };
    }
    case BROWSER_TOOL_NAME.manageTabs:
      return manageTabs(args);
    case BROWSER_TOOL_NAME.captureVisibleTab: {
      return captureVisibleTab(args);
    }
    case BROWSER_TOOL_NAME.mutatePage: {
      return mutatePage({ ...args, tabId: await resolveTabId(args.tabId) });
    }
    case BROWSER_TOOL_NAME.inspectPage: {
      return inspectPage({
        ...args,
        tabId:
          args.tabId ??
          (Array.isArray(args.tabIds)
            ? undefined
            : await resolveTabId(args.tabId)),
      });
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

async function navigateManagedTab(args: Record<string, unknown>) {
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
  if (args.focus === true) await focusTab(tabId);
  if (String(args.waitUntil || "load") === "load") {
    await wait(100);
    await waitTabComplete(tabId);
  }
  return { success: true, tabId, type };
}

async function manageTabs(args: Record<string, unknown>) {
  const operation = String(args.operation || "list");
  if (operation === "list") return listTabs(args);
  if (operation === "open") return openTab(args);
  if (operation === "search") return searchTabs(args);
  if (operation === "webSearch") return openSearch(args);
  if (operation === "focus") {
    const tabId = await resolveTabId(args.tabId);
    await focusTab(tabId);
    return { success: true, tabId };
  }
  if (operation === "close") return closeManagedTabs(args);
  if (operation === "group") return groupManagedTabs(args);
  if (operation === "navigate") return navigateManagedTab(args);
  return { success: false, error: "UNKNOWN_TAB_OPERATION", operation };
}

async function listTabs(args: Record<string, unknown>) {
  const tabs = await getBrowserApi().tabs.query({});
  return withListSlice(
    {},
    tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
    })),
    args,
    "tabs",
  );
}

async function searchTabs(args: Record<string, unknown>) {
  const query = String(args.query || args.url || args.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const tabs = await getBrowserApi().tabs.query({});
  const matchedTabs = query
    ? tabs.filter((tab) => {
        const haystack = `${tab.title || ""} ${tab.url || ""}`.toLowerCase();
        return haystack.includes(query);
      })
    : tabs;
  return withListSlice(
    { query, totalTabCount: tabs.length },
    matchedTabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
    })),
    args,
    "tabs",
  );
}

async function openTab(args: Record<string, unknown>) {
  const tab = await getBrowserApi().tabs.create({
    url: String(args.url || "about:blank"),
    active: args.active === true || args.focus === true,
  });
  if (tab.id && String(args.waitUntil || "load") === "load")
    await waitTabComplete(tab.id);
  const loadedTab = tab.id ? await getBrowserApi().tabs.get(tab.id) : tab;
  return {
    success: true,
    tab: { id: loadedTab.id, url: loadedTab.url, title: loadedTab.title },
  };
}

async function openSearch(args: Record<string, unknown>) {
  const query = String(args.query || "");
  const tab = await openDefaultSearchTab(query);
  return {
    success: true,
    tabId: tab?.id,
    tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : undefined,
  };
}

async function closeManagedTabs(args: Record<string, unknown>) {
  const tabIds = Array.isArray(args.tabIds)
    ? args.tabIds.map(Number).filter(Number.isFinite)
    : [Number(args.tabId)].filter(Number.isFinite);
  if (!tabIds.length)
    return { success: false, error: TOOL_ERROR.noTabIdsProvided };
  await getBrowserApi().tabs.remove(tabIds);
  return { success: true, tabIds };
}

async function focusTab(tabId: number) {
  const tab = await getBrowserApi().tabs.update(tabId, { active: true });
  if (!tab) throw new Error(TOOL_ERROR.tabNotFound);
  if (tab.windowId !== undefined)
    await getBrowserApi().windows.update(tab.windowId, { focused: true });
}

async function groupManagedTabs(args: Record<string, unknown>) {
  const api = getBrowserApi();
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
    const window = await api.windows.get(tab.windowId).catch(() => undefined);
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

async function captureVisibleTab(args: Record<string, unknown>) {
  const api = getBrowserApi();
  const tabId = await resolveTabId(args.tabId);
  const tab = await api.tabs.get(tabId);
  if (tab.windowId === undefined)
    return { success: false, error: TOOL_ERROR.tabHasNoWindow };
  await api.tabs.update(tabId, { active: true });
  await api.windows.update(tab.windowId, { focused: true });
  const format =
    String(args.format || DEFAULT_SCREENSHOT_FORMAT) === "png" ? "png" : "jpeg";
  const quality = Number(args.quality);
  const image = await api.tabs.captureVisibleTab(tab.windowId, {
    format,
    ...(format === "jpeg"
      ? {
          quality: Number.isFinite(quality)
            ? Math.min(100, Math.max(0, Math.trunc(quality)))
            : DEFAULT_SCREENSHOT_QUALITY,
        }
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
