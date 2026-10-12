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
import { callPage } from "../page-agent";
import { fail, ok, schema, stringArg, type ToolDefinition } from "./types";

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

export function tabLine(tab: chrome.tabs.Tab) {
  return `- tab ${tab.id}${tab.active ? " (active)" : ""}: ${tab.title || "(untitled)"} | ${tab.url || ""}`;
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
];

export const tabsTool: ToolDefinition = {
  name: TOOL_NAME.tabs,
  group: "browser",
  summary: "List, open, switch, close and navigate tabs",
  description:
    "Manage browser tabs: list, open (url), switch (tabId), close (tabId or tabIds), navigate (tabId, url), back, forward, reload. Opening and navigating wait for the page to load. Check list before opening a page that may already be open.",
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
        description: "Tabs to close.",
      },
      url: { type: "string" },
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
    if (action === "list") {
      const tabs = await api.tabs.query({});
      return ok(tabs.map(tabLine).join("\n") || "No tabs are open.", {
        action,
        count: tabs.length,
      });
    }
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
      const ids = Array.isArray(input.tabIds)
        ? input.tabIds.map(Number).filter(Number.isFinite)
        : [Number(input.tabId)].filter((id) => Number.isFinite(id) && id > 0);
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
    "Search the web with the browser's default search engine and get the results (title, URL, snippet). Open a result with tabs to read it.",
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

export const screenshotTool: ToolDefinition = {
  name: TOOL_NAME.screenshot,
  group: "pages",
  summary: "Image of the visible part of a tab",
  description:
    "See the visible part of a tab as an image. Use it only when the layout or visuals matter; snapshot is cheaper for text and controls. Brings the tab to the front.",
  parameters: schema({
    tabId: { type: "number", description: "Defaults to the active tab." },
  }),
  async execute(input, { signal }) {
    const api = getBrowserApi();
    const tabId =
      input.tabId === undefined
        ? (await getActiveTab())?.id
        : Number(input.tabId);
    if (!tabId) return fail("No tab to capture. Give a tabId from tabs list.");
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
