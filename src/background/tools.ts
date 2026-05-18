import {
  BROWSER_TOOL_TIMEOUT_MS,
  MARKDOWN_FILENAME_MAX_LENGTH,
  TAB_LOAD_WAIT_TIMEOUT_MS,
} from "../shared/config";
import { BROWSER_TOOL_NAME, UNKNOWN_TOOL_NAME } from "../shared/browser-tools";
import { isScriptableUrl } from "../shared/browser";
import { downloadTextFile, findImages, safeFileName } from "./downloads";
import { browserTools } from "./tool-schema";
import { withTimeout } from "./tool-utils";

export { browserTools };
async function executeBrowserTool(
  name: string | undefined,
  args: Record<string, unknown>,
) {
  switch (name) {
    case BROWSER_TOOL_NAME.getCurrentTab: {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) return { error: "NEED_PAGE_CONTENT_ACCESS_PERMISSION" };
      return tab.url?.startsWith("http")
        ? { tabId: tab.id, title: tab.title, url: tab.url }
        : { error: "Not a web page" };
    }
    case BROWSER_TOOL_NAME.openNewTabWithURL: {
      const tab = await chrome.tabs.create({
        url: String(args.url || ""),
        active: false,
      });
      if (tab.id) {
        await waitTabComplete(tab.id);
        const loadedTab = await chrome.tabs.get(tab.id);
        return {
          tab: { id: loadedTab.id, url: loadedTab.url, title: loadedTab.title },
        };
      }
      return { tab: { id: tab.id } };
    }
    case BROWSER_TOOL_NAME.getAllTabs: {
      const tabs = await chrome.tabs.query({});
      return tabs.map((tab) => ({ id: tab.id, title: tab.title }));
    }
    case BROWSER_TOOL_NAME.closeTab: {
      const tabIds = Array.isArray(args.tabIds)
        ? args.tabIds.map(Number).filter(Number.isFinite)
        : [Number(args.tabId)].filter(Number.isFinite);
      if (!tabIds.length)
        return { success: false, error: "No tab IDs provided" };
      await chrome.tabs.remove(tabIds);
      return { success: true, tabIds };
    }
    case BROWSER_TOOL_NAME.goToTab: {
      const tab = await chrome.tabs.update(await resolveTabId(args.tabId), {
        active: true,
      });
      if (!tab) return { success: false, error: "Tab not found" };
      if (tab.windowId !== undefined)
        await chrome.windows.update(tab.windowId, { focused: true });
      return { success: true };
    }
    case BROWSER_TOOL_NAME.insertCSSToTab: {
      await chrome.scripting.insertCSS({
        target: { tabId: await resolveTabId(args.tabId) },
        css: String(args.css || ""),
      });
      return { success: true };
    }
    case BROWSER_TOOL_NAME.removeCSSToTab: {
      await chrome.scripting.removeCSS({
        target: { tabId: await resolveTabId(args.tabId) },
        css: String(args.css || ""),
      });
      return { success: true };
    }
    case BROWSER_TOOL_NAME.openSearchTab: {
      const query = String(args.query || "");
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      const tab = await chrome.tabs.create({ url: searchUrl, active: false });
      return { success: true, tabId: tab.id };
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
        const tab = await chrome.tabs.get(tabId);
        const markdown = isScriptableUrl(tab.url)
          ? await extractMarkdown(tabId)
          : "";
        contents.push({
          tabId,
          title: tab.title || "",
          url: tab.url || "",
          markdown,
        });
      }
      return { contents };
    }
    case BROWSER_TOOL_NAME.findAccessableElementsFromTab: {
      return {
        elements: await findAccessibleElements(await resolveTabId(args.tabId)),
      };
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
        return { success: false, error: "No tab IDs provided" };
      const color = String(
        args.color || "cyan",
      ) as chrome.tabGroups.UpdateProperties["color"];
      const title = String(args.title || "");
      const tabs = await Promise.all(
        tabIds.map((tabId) => chrome.tabs.get(tabId).catch(() => undefined)),
      );
      const normalTabs = [];
      const skippedTabIds = [];

      for (const tab of tabs) {
        if (!tab?.id || tab.windowId === undefined) continue;
        const window = await chrome.windows
          .get(tab.windowId)
          .catch(() => undefined);
        if (window?.type === "normal") normalTabs.push(tab);
        else skippedTabIds.push(tab.id);
      }

      if (!normalTabs.length)
        return {
          success: false,
          error: "No tabs in normal browser windows can be grouped",
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
        const groupId = await chrome.tabs.group({
          tabIds: windowTabIds as [number, ...number[]],
        });
        await chrome.tabGroups.update(groupId, { title, color });
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
      const tab = await chrome.tabs.get(tabId);
      const markdown = await extractMarkdown(tabId);
      const filename = `${safeFileName(tab.title || tab.url || "tab").slice(0, MARKDOWN_FILENAME_MAX_LENGTH)}.md`;
      await downloadTextFile(filename, markdown, "text/markdown;charset=utf-8");
      return { success: true, filename };
    }
    case BROWSER_TOOL_NAME.downloadAllImagesInTab: {
      return findImages(await resolveTabId(args.tabId));
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
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
  const tabId = Number(value);
  if (Number.isFinite(tabId) && tabId > 0) return tabId;
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) throw new Error("No active tab available");
  return activeTab.id;
}

async function extractMarkdown(tabId: number) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () =>
      `# ${document.title}\n\nURL: ${location.href}\n\n${document.body?.innerText || ""}`,
  });
  return String(result.result || "");
}

async function findAccessibleElements(tabId: number) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selectors =
        'a, button, input, textarea, img, [contenteditable="true"], [aria-label]';
      const elements: Array<{
        type: string;
        id: string;
        properties: Record<string, unknown>;
      }> = [];
      Array.from(document.querySelectorAll(selectors)).forEach((element) => {
        const htmlElement = element as
          | HTMLAnchorElement
          | HTMLImageElement
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLElement;
        const tag = htmlElement.tagName.toLowerCase();
        const style = getComputedStyle(htmlElement);
        if (
          style.display === "none" ||
          tag === "img" ||
          (tag === "a" &&
            (!(htmlElement as HTMLAnchorElement).href ||
              /^(javascript:|mailto:|tel:|data:|blob:|about:|chrome:|#)/i.test(
                (htmlElement as HTMLAnchorElement).href,
              ))) ||
          (tag === "input" &&
            (htmlElement as HTMLInputElement).type === "hidden")
        ) {
          return;
        }
        if (htmlElement.getAttribute("data-ai-id")) return;

        const id = `ai-id-${Math.random().toString(36).substring(2, 8)}`;
        htmlElement.setAttribute("data-ai-id", id);
        let type =
          (
            {
              img: "image",
              a: "link",
              button: "button",
              textarea: "textarea",
              input: "input",
            } as Record<string, string>
          )[tag] || tag;
        if (htmlElement.hasAttribute("contenteditable"))
          type = "contentEditable";

        const properties: Record<string, unknown> = {};
        if (type === "button")
          properties.buttonType = (htmlElement as HTMLButtonElement).type;
        if (type === "input") {
          const input = htmlElement as HTMLInputElement;
          if (input.type) properties.inputType = input.type;
          if (input.placeholder) properties.placeholder = input.placeholder;
        }
        const ariaLabel = htmlElement.getAttribute("aria-label");
        if (ariaLabel) properties.ariaLabel = ariaLabel;
        else if (type === "image")
          properties.alt = (htmlElement as HTMLImageElement).alt || "";
        const role = htmlElement.getAttribute("role");
        if (role) properties.role = role;
        if (type === "input" || type === "textarea")
          properties.value = (
            htmlElement as HTMLInputElement | HTMLTextAreaElement
          ).value;
        else if (type === "contentEditable")
          properties.value = htmlElement.innerHTML;
        if (type === "link") properties.content = htmlElement.textContent;
        else if (type === "image")
          properties.alt = (htmlElement as HTMLImageElement).alt;
        elements.push({ type, id, properties });
      });
      return elements;
    },
  });
  return result.result || [];
}

async function getElementProperties(tabId: number, ids: string[]) {
  const [result] = await chrome.scripting.executeScript({
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

async function clickElement(tabId: number, id: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id],
    func: (aiId) => {
      const element = document.querySelector(`[data-ai-id="${aiId}"]`) as
        | HTMLAnchorElement
        | HTMLElement
        | null;
      if (!element) return { isNewTab: false, notFound: true };
      if (
        element.tagName === "A" &&
        (element as HTMLAnchorElement).getAttribute("href")
      ) {
        const href = (element as HTMLAnchorElement).getAttribute("href");
        return {
          isNewTab: true,
          url: href
            ? new URL(href, window.location.origin).href
            : (element as HTMLAnchorElement).href,
        };
      }
      element.click();
      return { isNewTab: false };
    },
  });
  const output = result.result as
    | { isNewTab?: boolean; notFound?: boolean; url?: string }
    | undefined;
  if (output?.isNewTab && output.url) {
    const tab = await chrome.tabs.create({ url: output.url, active: false });
    return { success: true, tabId: tab.id, shouldWaitTabLoadFinished: true };
  }
  return { success: !output?.notFound, tabId };
}

async function inputElement(tabId: number, id: string, text: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id, text],
    func: (aiId, value) => {
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
        error: "Element is not an input, textarea, or contenteditable",
      };
    },
  });
  return { ...(result.result || { success: false }), tabId };
}

async function scrollToBottom(tabId: number) {
  await chrome.scripting.executeScript({
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

async function waitTabComplete(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;
  await new Promise<void>((resolve) => {
    const listener = (
      changedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (changedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, TAB_LOAD_WAIT_TIMEOUT_MS);
  });
}
