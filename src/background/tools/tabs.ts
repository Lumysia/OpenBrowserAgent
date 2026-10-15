import { trimmedString } from "../../shared/values";
import { isScriptableUrl } from "../../shared/browser";
import { delay } from "../../shared/cancellation";
import { TAB_LOAD_WAIT_TIMEOUT_MS } from "../../shared/config";
import { getBrowserApi } from "../../shared/browser-api";
import { TOOL_NAME } from "../../shared/tool-names";
import { adoptAgentTab, agentTabIds, openAgentTab } from "../agent-tabs";
import { callPage } from "../page-agent";
import { RUN_TAB_ID_PARAM } from "../run-tab";
import {
  fail,
  ok,
  schema,
  type RunContext,
  type ToolDefinition,
} from "./types";

const SEARCH_RESULT_LIMIT = 8;
const SEARCH_RESULT_POLL_MS = 300;

function isLoadedPage(tab: chrome.tabs.Tab) {
  return (
    isScriptableUrl(tab.url) &&
    tab.url !== "about:blank" &&
    !tab.pendingUrl &&
    tab.status === "complete"
  );
}

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

export function tabLine(
  tab: chrome.tabs.Tab,
  options: { group?: string; mine?: boolean; working?: boolean } = {},
) {
  const marks = [
    tab.active && "active",
    options.working && "working tab",
    options.mine && "opened by you",
  ]
    .filter(Boolean)
    .join(", ");
  return `- tab ${tab.id}${marks ? ` (${marks})` : ""}${options.group ? ` [group: ${options.group}]` : ""}: ${tab.title || "(untitled)"} | ${tab.url || ""}`;
}

// Open tabs, optionally only those whose title or URL holds every word of
// `query`, with the names of their tab groups, the run's working tab and
// which ones this chat opened.
async function listTabs(query: string, run: RunContext) {
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
  const mine = await agentTabIds(run);
  const lines = tabs.map((tab) =>
    tabLine(tab, {
      group: groups.get(tab.groupId ?? -1),
      mine: mine.has(tab.id ?? -1),
      working: tab.id !== undefined && tab.id === run.tab.id,
    }),
  );
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
  const title = trimmedString(input.title);
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

// Brings a tab to the front, only when the user asked to see it.
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
    "Manage browser tabs: list (query: only tabs whose title or URL has these words; marks your working tab and the tabs opened by you), open (url; opens in the background and joins this chat's tab group; show: true only when the user wants to see it), switch (tabId; brings the tab to the front: only when the user asks), close (tabId or tabIds), navigate (tabId, url), back, forward, reload, group (tabIds, title, color), ungroup (tabIds). The tab you open, navigate or switch to becomes the tab you work on. Opening and navigating wait for the page to load. Check list before opening a page that may already be open.",
  parameters: schema(
    {
      action: { type: "string", enum: TAB_ACTIONS },
      tabId: RUN_TAB_ID_PARAM,
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "Tabs to close, group or ungroup.",
      },
      url: { type: "string" },
      query: { type: "string" },
      title: { type: "string", description: "Group name." },
      color: { type: "string", enum: GROUP_COLORS },
      show: {
        type: "boolean",
        description:
          "open: bring the new tab to the front. Only when the user wants to see the page.",
      },
    },
    ["action"],
  ),
  async execute(input, { run, signal }) {
    const api = getBrowserApi();
    const action = trimmedString(input.action) || "list";
    if (action === "list") return listTabs(trimmedString(input.query), run);
    if (action === "group" || action === "ungroup")
      return groupTabs(action, input);
    if (action === "open") {
      const url = trimmedString(input.url);
      if (!url) return fail("url is required to open a tab.");
      const { tab: created, group } = await openAgentTab(run, {
        url,
        active: input.show === true,
      });
      run.tab.use(created);
      if (created.id !== undefined) await waitTabComplete(created.id, signal);
      const tab =
        created.id !== undefined ? await api.tabs.get(created.id) : created;
      return {
        text: `Opened ${tabLine(tab, { group, mine: true }).slice(2)}`,
        details: {
          action,
          tabId: tab.id,
          title: tab.title,
          url: tab.url,
          group,
        },
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
    const tabId = (await run.tab.target(input.tabId)).id;
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
      const url = trimmedString(input.url);
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
  async execute(input, { run, signal }) {
    const query = trimmedString(input.query);
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
      // search.query returns before navigation starts, and engines that
      // render results with script fill them in after the page loads.
      const end = Date.now() + TAB_LOAD_WAIT_TIMEOUT_MS;
      let tab = await api.tabs.get(tabId);
      while (!isLoadedPage(tab) && Date.now() < end) {
        await delay(150, signal);
        tab = await api.tabs.get(tabId);
      }
      const read = async () =>
        (
          await callPage<
            Array<{ title: string; url: string; snippet: string }>
          >(tabId, "searchResults", { limit: SEARCH_RESULT_LIMIT }, signal)
        ).value;
      let results = await read();
      while (!results.length && Date.now() < end) {
        await delay(SEARCH_RESULT_POLL_MS, signal);
        results = await read();
      }
      tab = await api.tabs.get(tabId);
      if (!results.length) {
        keep = true;
        await adoptAgentTab(run, tab);
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
