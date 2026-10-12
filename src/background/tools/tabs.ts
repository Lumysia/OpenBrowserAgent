import {
  getActiveTab,
  isScriptableUrl,
  resolveBrowserTabId,
} from "../../shared/browser";
import { delay } from "../../shared/cancellation";
import {
  DEFAULT_SCREENSHOT_QUALITY,
  TAB_LOAD_WAIT_TIMEOUT_MS,
} from "../../shared/config";
import { getBrowserApi } from "../../shared/storage";
import { TOOL_NAME } from "../../shared/tool-names";
import { areCdpAvailable } from "../../shared/runtime-capabilities";
import { withCdp } from "../cdp";
import { callPage } from "../page-agent";
import {
  fail,
  ok,
  schema,
  stringArg,
  type ToolDefinition,
  type ToolResult,
} from "./types";

const SEARCH_RESULT_LIMIT = 8;

// Resolves once the tab finished loading (or after the load timeout).
export async function waitTabComplete(tabId: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const api = getBrowserApi();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      api.tabs.onUpdated.removeListener(listener);
      signal?.removeEventListener("abort", abort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const listener = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === "complete") finish();
    };
    api.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(finish, TAB_LOAD_WAIT_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    // Subscribe before querying so a completed navigation is not missed.
    api.tabs.get(tabId).then(
      (tab) => tab.status === "complete" && finish(),
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function tabLine(tab: chrome.tabs.Tab, group?: string) {
  return `- tab ${tab.id}${tab.active ? " (active)" : ""}${group ? ` [group: ${group}]` : ""}: ${tab.title || "(untitled)"} | ${tab.url || ""}`;
}

// Open tabs, optionally only those whose title or URL holds every word of
// `query`, with the names of their tab groups.
async function listTabs(query: string) {
  const api = getBrowserApi();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tabs = (await api.tabs.query({})).filter((tab) => {
    const text = `${tab.title || ""} ${tab.url || ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const groups = new Map(
    (await api.tabGroups?.query({}).catch(() => []))?.map((group) => [
      group.id,
      group.title || group.color,
    ]) || [],
  );
  const lines = tabs.map((tab) => tabLine(tab, groups.get(tab.groupId ?? -1)));
  return ok(
    lines.join("\n") ||
      (query ? `No open tab matches "${query}".` : "No tabs are open."),
    { action: "list", count: tabs.length },
  );
}

const GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

// Groups tabs per window (a group cannot span windows), or ungroups them.
async function groupTabs(action: string, input: Record<string, unknown>) {
  const api = getBrowserApi();
  if (!api.tabs.group || !api.tabGroups)
    return fail("Tab groups are unavailable in this browser.");
  const ids = tabIdList(input);
  if (!ids.length) return fail(`Give tabIds to ${action}.`);
  if (action === "ungroup") {
    await api.tabs.ungroup(ids as [number, ...number[]]);
    return ok(`Ungrouped tab ${ids.join(", ")}.`, { action, tabIds: ids });
  }
  const byWindow = new Map<number, number[]>();
  for (const id of ids) {
    const tab = await api.tabs.get(id).catch(() => undefined);
    if (tab?.windowId === undefined) continue;
    byWindow.set(tab.windowId, [...(byWindow.get(tab.windowId) || []), id]);
  }
  if (!byWindow.size) return fail("None of these tabs exist.");
  const color = GROUP_COLORS.includes(String(input.color))
    ? (String(input.color) as chrome.tabGroups.Color)
    : undefined;
  const title = stringArg(input.title);
  const groupIds: number[] = [];
  for (const windowTabs of byWindow.values()) {
    const groupId = await api.tabs.group({
      tabIds: windowTabs as [number, ...number[]],
    });
    await api.tabGroups.update(groupId, {
      ...(title ? { title } : {}),
      ...(color ? { color } : {}),
    });
    groupIds.push(groupId);
  }
  return ok(`Grouped tab ${ids.join(", ")}${title ? ` as "${title}"` : ""}.`, {
    action,
    tabIds: ids,
    groupIds,
  });
}

function tabIdList(input: Record<string, unknown>) {
  return Array.isArray(input.tabIds)
    ? input.tabIds.map(Number).filter(Number.isFinite)
    : [Number(input.tabId)].filter((id) => Number.isFinite(id) && id > 0);
}

async function focusTab(tabId: number) {
  const api = getBrowserApi();
  const tab = await api.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined)
    await api.windows.update(tab.windowId, { focused: true });
}

const TAB_ACTIONS = [
  "list",
  "open",
  "switch",
  "close",
  "navigate",
  "back",
  "forward",
  "reload",
  "group",
  "ungroup",
];

export const tabsTool: ToolDefinition = {
  name: TOOL_NAME.tabs,
  group: "browser",
  summary: "List, open, switch, close and navigate tabs",
  description:
    "Manage browser tabs: list (query: only tabs whose title or URL has these words), open (url), switch (tabId), close (tabId or tabIds), navigate (tabId, url), back, forward, reload, group (tabIds, title, color), ungroup (tabIds). Opening and navigating wait for the page to load. Check list before opening a page that may already be open.",
  parameters: schema(
    {
      action: { type: "string", enum: TAB_ACTIONS },
      tabId: {
        type: "number",
        description: "Tab to act on. Defaults to the active tab.",
      },
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "Tabs to close, group or ungroup.",
      },
      url: { type: "string" },
      query: { type: "string" },
      title: { type: "string", description: "Group name." },
      color: { type: "string", enum: GROUP_COLORS },
      background: {
        type: "boolean",
        description: "open: do not switch to the new tab.",
      },
    },
    ["action"],
  ),
  async execute(input, { signal }) {
    const api = getBrowserApi();
    const action = stringArg(input.action) || "list";
    if (action === "list") return listTabs(stringArg(input.query));
    if (action === "group" || action === "ungroup")
      return groupTabs(action, input);
    if (action === "open") {
      const url = stringArg(input.url);
      if (!url) return fail("url is required to open a tab.");
      const created = await api.tabs.create({
        url,
        active: input.background !== true,
      });
      if (created.id !== undefined) await waitTabComplete(created.id, signal);
      const tab =
        created.id !== undefined ? await api.tabs.get(created.id) : created;
      return {
        text: `Opened ${tabLine(tab).slice(2)}`,
        details: { action, tabId: tab.id, title: tab.title, url: tab.url },
        sources: [
          {
            kind: "page",
            title: tab.title || url,
            url: tab.url || url,
            tabId: tab.id,
          },
        ],
      };
    }
    if (action === "close") {
      const ids = tabIdList(input);
      if (!ids.length) return fail("Give tabId or tabIds to close.");
      await api.tabs.remove(ids);
      return ok(`Closed tab ${ids.join(", ")}.`, { action, tabIds: ids });
    }
    const tabId = await resolveBrowserTabId(input.tabId);
    signal?.throwIfAborted();
    if (action === "switch") {
      await focusTab(tabId);
      const tab = await api.tabs.get(tabId);
      return ok(`Switched to ${tabLine(tab).slice(2)}`, {
        action,
        tabId,
        title: tab.title,
        url: tab.url,
      });
    }
    if (action === "navigate") {
      const url = stringArg(input.url);
      if (!url) return fail("url is required to navigate.");
      await api.tabs.update(tabId, { url });
    } else if (action === "back") await api.tabs.goBack(tabId);
    else if (action === "forward") await api.tabs.goForward(tabId);
    else if (action === "reload") await api.tabs.reload(tabId);
    else
      return fail(`Unknown action "${action}". Use ${TAB_ACTIONS.join(", ")}.`);
    await delay(100, signal);
    await waitTabComplete(tabId, signal);
    const tab = await api.tabs.get(tabId);
    return {
      text: `${tabLine(tab).slice(2)}\nRefs from the previous page are gone; take a snapshot.`,
      details: { action, tabId, title: tab.title, url: tab.url },
      sources: [
        {
          kind: "page",
          title: tab.title || tab.url || "",
          url: tab.url,
          tabId,
        },
      ],
    };
  },
};

export const webSearchTool: ToolDefinition = {
  name: TOOL_NAME.webSearch,
  group: "web",
  readOnly: true,
  summary: "Search the web",
  description:
    "Search the web with the browser's default search engine and get the results (title, URL, snippet). Read a result with read and its URL; open it in a tab only to interact with it or to show it to the user.",
  parameters: schema({ query: { type: "string" } }, ["query"]),
  async execute(input, { signal }) {
    const query = stringArg(input.query);
    if (!query) return fail("query is required.");
    const api = getBrowserApi();
    if (!api.search?.query)
      return fail(
        "Web search is unavailable in this browser. Open a search engine URL with tabs instead.",
      );
    const created = await api.tabs.create({
      url: "about:blank",
      active: false,
    });
    if (created.id === undefined) return fail("Could not open a search tab.");
    const tabId = created.id;
    let keep = false;
    try {
      await api.search.query({ text: query, tabId });
      // search.query returns before navigation starts.
      const end = Date.now() + TAB_LOAD_WAIT_TIMEOUT_MS;
      let tab = await api.tabs.get(tabId);
      while (
        (!isScriptableUrl(tab.url) ||
          tab.url === "about:blank" ||
          tab.status !== "complete") &&
        Date.now() < end
      ) {
        await delay(150, signal);
        tab = await api.tabs.get(tabId);
      }
      const { value: results } = await callPage<
        Array<{ title: string; url: string; snippet: string }>
      >(tabId, "searchResults", { limit: SEARCH_RESULT_LIMIT }, signal);
      if (!results.length) {
        keep = true;
        return fail(
          `No results could be read from the search page (tab ${tabId}: ${tab.title || tab.url}). It stays open: snapshot it to see what it shows.`,
          { query, tabId },
        );
      }
      return {
        text: results
          .map(
            (result, index) =>
              `${index + 1}. ${result.title} | ${result.url}\n   ${result.snippet}`,
          )
          .join("\n"),
        details: {
          query,
          count: results.length,
          results: results.map(({ title, url }) => ({ title, url })),
        },
        sources: results.map((result) => ({
          kind: "search" as const,
          title: result.title,
          url: result.url,
          snippet: result.snippet,
        })),
      };
    } finally {
      if (!keep) await api.tabs.remove(tabId).catch(() => undefined);
    }
  },
};

// Longest edge of a full-page screenshot; vision models scale larger images
// down anyway.
const FULL_PAGE_MAX_EDGE = 8_000;

export const screenshotTool: ToolDefinition = {
  name: TOOL_NAME.screenshot,
  group: "pages",
  summary: "Image of a tab",
  description:
    "See a tab as an image: the visible part (brings the tab to the front), or fullPage: true for the whole page through the Chrome debugger. Use it only when the layout or visuals matter; snapshot is cheaper for text and controls.",
  parameters: schema({
    tabId: { type: "number", description: "Defaults to the active tab." },
    fullPage: { type: "boolean" },
  }),
  async execute(input, { signal }) {
    const api = getBrowserApi();
    const tabId =
      input.tabId === undefined
        ? (await getActiveTab())?.id
        : Number(input.tabId);
    if (!tabId) return fail("No tab to capture. Give a tabId from tabs list.");
    if (input.fullPage === true) return fullPageShot(tabId, signal);
    await focusTab(tabId);
    signal?.throwIfAborted();
    const tab = await api.tabs.get(tabId);
    const image = await api.tabs.captureVisibleTab(tab.windowId!, {
      format: "jpeg",
      quality: DEFAULT_SCREENSHOT_QUALITY,
    });
    return {
      text: `Screenshot of tab ${tabId} (${tab.title || tab.url}) attached.`,
      details: { tabId, title: tab.title, url: tab.url, image, format: "jpeg" },
      image: { dataUrl: image, type: "image/jpeg" },
    };
  },
};

async function fullPageShot(
  tabId: number,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (!areCdpAvailable())
    return fail(
      "Full-page screenshots need the Chrome debugger, which this browser lacks. Take the visible part and scroll.",
    );
  const tab = await getBrowserApi().tabs.get(tabId);
  const { image, width, height, scale } = await withCdp(
    { tabId },
    async (send) => {
      const metrics = await send("Page.getLayoutMetrics");
      const size = metrics.cssContentSize || metrics.contentSize;
      const width = Math.ceil(size.width);
      const height = Math.ceil(size.height);
      const scale = Math.min(1, FULL_PAGE_MAX_EDGE / Math.max(width, height));
      const { data } = await send("Page.captureScreenshot", {
        format: "jpeg",
        quality: DEFAULT_SCREENSHOT_QUALITY,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale },
      });
      return { image: `data:image/jpeg;base64,${data}`, width, height, scale };
    },
    signal,
  );
  return {
    text: `Full-page screenshot of tab ${tabId} (${tab.title || tab.url}, ${width}x${height} px${scale < 1 ? `, scaled to ${Math.round(scale * 100)}%` : ""}) attached.`,
    details: { tabId, title: tab.title, url: tab.url, image, format: "jpeg" },
    image: { dataUrl: image, type: "image/jpeg" },
  };
}
