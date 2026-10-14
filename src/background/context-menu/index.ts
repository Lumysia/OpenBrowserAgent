import {
  CONTEXT_MENU_ID,
  contextMenuEntries,
  normalizeContextMenuSettings,
  type ContextMenuEntry,
} from "../../shared/context-menu";
import { getMessages } from "../../shared/i18n";
import { SIDE_PANEL_TASK } from "../../shared/side-panel-handoff";
import { getBrowserApi, storage } from "../../shared/storage";
import { handOffToSidePanel } from "../side-panel-handoff";
import { copyPageMarkdown } from "./copy-markdown";

type Menus = typeof chrome.contextMenus & {
  ContextType?: Record<string, string>;
};

// The right-click menu, built again when the settings or the language
// change. A service worker's items outlive the worker, so it builds them on
// install and browser start; a background page's items live as long as the
// page, so it builds them whenever it starts. Browsers without menus (Safari
// on iOS) get none.
export function setupContextMenu() {
  const api = getBrowserApi();
  const menus = api.contextMenus as Menus | undefined;
  if (!menus) return;
  let built: string | undefined;
  let queue = Promise.resolve();
  const rebuild = (force: boolean) => {
    queue = queue
      .then(async () => {
        const entries = await menuEntries(menus);
        const key = JSON.stringify(entries);
        if (!force && key === built) return;
        built = key;
        await menus.removeAll();
        for (const entry of entries) await createEntry(menus, entry);
      })
      .catch((error) => {
        built = undefined;
        console.warn("Context menu update failed", error);
      });
  };
  const manifest = api.runtime.getManifest() as chrome.runtime.Manifest & {
    background?: { service_worker?: string };
  };
  if (!manifest.background?.service_worker) rebuild(false);
  api.runtime.onInstalled.addListener(() => rebuild(true));
  api.runtime.onStartup.addListener(() => rebuild(true));
  storage.preferences.watch(() => rebuild(false));
  storage.language.watch(() => rebuild(false));
  menus.onClicked.addListener(handleClick);
}

async function menuEntries(menus: Menus) {
  const [preferences, language] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
  ]);
  const t = getMessages(language).contextMenu.items;
  const name = getBrowserApi().i18n?.getMessage?.("extName");
  return contextMenuEntries(
    normalizeContextMenuSettings(preferences.contextMenu),
    { ...t, parent: name || "OpenBrowserAgent" },
    // The tab strip's menu: Firefox, Safari 18 and Chrome 150 have it.
    { tabContext: Object.values(menus.ContextType ?? {}).includes("tab") },
  );
}

function createEntry(menus: Menus, entry: ContextMenuEntry) {
  return new Promise<void>((resolve, reject) => {
    menus.create(
      {
        id: entry.id,
        parentId: entry.parentId,
        title: entry.title,
        contexts: entry.contexts as [chrome.contextMenus.ContextType],
      },
      () => {
        const error = getBrowserApi().runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      },
    );
  });
}

// Side panel items open the panel first, during the click's user gesture.
function handleClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) {
  const work = (() => {
    switch (info.menuItemId) {
      case CONTEXT_MENU_ID.ask:
        return handOffToSidePanel(tab, {
          task: SIDE_PANEL_TASK.ask,
          text: info.selectionText || "",
        });
      case CONTEXT_MENU_ID.summarizePage:
        return handOffToSidePanel(tab, { task: SIDE_PANEL_TASK.summarizePage });
      case CONTEXT_MENU_ID.searchPage:
        return handOffToSidePanel(tab, { task: SIDE_PANEL_TASK.searchWeb });
      case CONTEXT_MENU_ID.searchSelection:
        return handOffToSidePanel(tab, {
          task: SIDE_PANEL_TASK.searchWeb,
          text: info.selectionText || "",
        });
      case CONTEXT_MENU_ID.summarizeLink:
        return info.linkUrl
          ? handOffToSidePanel(tab, {
              task: SIDE_PANEL_TASK.summarizeLink,
              linkUrl: info.linkUrl,
            })
          : undefined;
      case CONTEXT_MENU_ID.copyMarkdown:
        return copyPageMarkdown(tab);
      default:
        return undefined;
    }
  })();
  work?.catch((error) =>
    console.warn("Context menu action failed", info.menuItemId, error),
  );
}
