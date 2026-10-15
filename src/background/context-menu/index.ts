import { PRODUCT_NAME } from "../../shared/config";
import {
  CONTEXT_MENU_ID,
  contextMenuEntries,
  normalizeContextMenuSettings,
  type ContextMenuEntry,
} from "../../shared/context-menu";
import { actionMenuChange, actionMenuEntries } from "../../shared/action-menu";
import { getMessages } from "../../shared/i18n";
import { languageName } from "../../shared/language-name";
import { matchTargetLanguage } from "../../shared/page-translate/settings";
import type { PageToolsState } from "../../shared/page-tools";
import { SIDE_PANEL_TASK } from "../../shared/side-panel-handoff";
import { storage } from "../../shared/storage";
import { getBrowserApi } from "../../shared/browser-api";
import { togglePageTranslation } from "../page-translate";
import { activeTab, changePageTool, tabPageTools } from "../page-tools";
import { onPageToolsChanged } from "../page-tools-events";
import { handOffToSidePanel } from "../side-panel-handoff";
import { translateSelection } from "../smart-bar";
import { toggleVideoSubtitles } from "../video-subtitles";
import { copyPageMarkdown } from "./copy-markdown";

type Menus = typeof chrome.contextMenus & {
  ContextType?: Record<string, string>;
};

// The right-click menu and the toolbar button's own menu, built again when
// the settings, the language or the active tab's page tools change. When
// only titles or states change, the items are updated in place. A service
// worker's items outlive the worker, so it builds them on install and
// browser start; a background page's items live as long as the page, so it
// builds them whenever it starts. Browsers without menus (Safari on iOS) get
// none.
export function setupContextMenu() {
  const api = getBrowserApi();
  const menus = api.contextMenus as Menus | undefined;
  if (!menus) return;
  let built: ContextMenuEntry[] | undefined;
  let queue = Promise.resolve();
  const rebuild = (force: boolean) => {
    queue = queue
      .then(async () => {
        const entries = await menuEntries(menus);
        if (!force && built && sameStructure(built, entries)) {
          const before = built;
          built = entries;
          for (const [index, entry] of entries.entries())
            if (JSON.stringify(entry) !== JSON.stringify(before[index]))
              await updateEntry(menus, entry);
          return;
        }
        built = entries;
        await menus.removeAll();
        for (const entry of entries) await createEntry(menus, entry);
      })
      .catch((error) => {
        built = undefined;
        console.warn("Context menu update failed", error);
      });
    return queue;
  };
  const manifest = api.runtime.getManifest() as chrome.runtime.Manifest & {
    background?: { service_worker?: string };
  };
  if (!manifest.background?.service_worker) rebuild(false);
  api.runtime.onInstalled.addListener(() => rebuild(true));
  api.runtime.onStartup.addListener(() => rebuild(true));
  // Also on settings and language changes (see setupPageTools).
  onPageToolsChanged(() => rebuild(false));
  menus.onClicked.addListener(handleClick);
  // Firefox updates an open menu before it shows.
  const shown = menus as Menus & {
    onShown?: { addListener(listener: () => void): void };
    refresh?: () => void;
  };
  shown.onShown?.addListener(() => {
    void rebuild(false).then(() => shown.refresh?.());
  });
}

async function menuEntries(menus: Menus) {
  const [preferences, language, state] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
    activeTab().then(tabPageTools),
  ]);
  const messages = getMessages(language);
  const t = messages.contextMenu.items;
  const name = getBrowserApi().i18n?.getMessage?.("extName");
  const types = Object.values(menus.ContextType ?? {});
  const page = contextMenuEntries(
    normalizeContextMenuSettings(preferences.contextMenu),
    {
      ...t,
      translatePage: state.translated
        ? messages.pageTranslate.menu.showOriginal
        : messages.pageTranslate.menu.translatePage,
      // The active tab's video has them: the item hides them.
      translateSubtitles: state.subtitles
        ? messages.pageTranslate.subtitles.menuHide
        : messages.pageTranslate.subtitles.menu,
      parent: name || PRODUCT_NAME,
    },
    // The tab strip's menu: Firefox, Safari 18 and Chrome 150 have it.
    { tabContext: types.includes("tab") },
  );
  return [...page, ...actionEntries(state, language, types)];
}

// The toolbar button's menu: "action" in Manifest V3, "browser_action" in
// Firefox's Manifest V2; none where the browser has neither.
function actionEntries(
  state: PageToolsState,
  language: string,
  types: string[],
) {
  const context = ["action", "browser_action"].find((type) =>
    types.includes(type),
  );
  if (!context) return [];
  const messages = getMessages(language);
  const p = messages.pageTranslate;
  const names = new Intl.DisplayNames([language], { type: "language" });
  return actionMenuEntries(
    state,
    {
      translatePage: p.menu.translatePage,
      showOriginal: p.menu.showOriginal,
      translateInto: messages.pageTools.translateInto,
      followInterface: p.followInterface,
      pageButton: messages.pageTools.pageButton,
      smartBar: messages.pageTools.smartBar,
      subtitles: messages.pageTools.subtitles,
    },
    {
      contexts: [context],
      languageName: (tag) => {
        try {
          return names.of(tag) || languageName(tag);
        } catch {
          return languageName(tag);
        }
      },
      interfaceLanguage: matchTargetLanguage(language) || "en",
    },
  );
}

// The same items in the same places: only titles and states differ.
function sameStructure(a: ContextMenuEntry[], b: ContextMenuEntry[]) {
  const shape = (entries: ContextMenuEntry[]) =>
    JSON.stringify(
      entries.map(({ id, parentId, type, contexts }) => [
        id,
        parentId,
        type,
        contexts,
      ]),
    );
  return shape(a) === shape(b);
}

function updateEntry(menus: Menus, entry: ContextMenuEntry) {
  return new Promise<void>((resolve) => {
    const { title, checked, enabled, visible } = entry;
    menus.update(
      entry.id,
      {
        title,
        ...(checked !== undefined && { checked }),
        enabled: enabled ?? true,
        visible: visible ?? true,
      },
      () => {
        void getBrowserApi().runtime.lastError;
        resolve();
      },
    );
  });
}

function createEntry(menus: Menus, entry: ContextMenuEntry) {
  return new Promise<void>((resolve, reject) => {
    menus.create(
      {
        id: entry.id,
        parentId: entry.parentId,
        title: entry.title,
        contexts: entry.contexts as [chrome.contextMenus.ContextType],
        ...(entry.type && { type: entry.type }),
        ...(entry.checked !== undefined && { checked: entry.checked }),
        ...(entry.enabled !== undefined && { enabled: entry.enabled }),
        ...(entry.visible !== undefined && { visible: entry.visible }),
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
  const tool = actionMenuChange(info.menuItemId, info.checked);
  const work = (() => {
    if (tool) return changePageTool(tab, tool);
    switch (info.menuItemId) {
      case CONTEXT_MENU_ID.ask:
      case CONTEXT_MENU_ID.askSelection:
        return handOffToSidePanel(tab, {
          task: SIDE_PANEL_TASK.ask,
          text: info.selectionText || "",
        });
      case CONTEXT_MENU_ID.translateSelection:
        return translateSelection(tab, info.frameId ?? 0);
      case CONTEXT_MENU_ID.summarizePage:
        return handOffToSidePanel(tab, { task: SIDE_PANEL_TASK.summarizePage });
      case CONTEXT_MENU_ID.translatePage:
        return togglePageTranslation(tab);
      case CONTEXT_MENU_ID.translateSubtitles:
        return toggleVideoSubtitles(tab, info.frameId ?? 0, info.srcUrl);
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
