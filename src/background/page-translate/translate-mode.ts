import { getBrowserApi } from "../../shared/browser-api";

// A tab's translate mode: once the user translates a page, every later page
// loaded in that tab is translated too (links, typed addresses, redirects,
// back/forward, same-document navigations), whatever site it is on. A reload
// of the tab, "Show original" or closing the tab ends it. A tab opened from
// a page in that mode (a link opened in a new tab, `window.open`) starts in
// it too; other new tabs start without it. Kept in session storage, so a restarted service worker still
// knows.
const SESSION_KEY = "page-translate-mode-tabs";

// The navigation fields this uses; webNavigation details have them. A
// browser that doesn't report `transitionType` never ends the mode with a
// reload, only with "Show original" or by closing the tab.
export type TabNavigation = {
  tabId: number;
  frameId: number;
  transitionType?: string;
};

type Area = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type TranslateModeOptions = {
  // Where the mode is stored; none keeps it in memory only.
  area?: Area;
  // Translates the tab's page unless it is already.
  translate(tabId: number): Promise<unknown>;
};

export function createTranslateMode({ area, translate }: TranslateModeOptions) {
  let loaded: Promise<Set<number>> | undefined;
  // One change at a time, in the order the events came.
  let queue: Promise<unknown> = Promise.resolve();

  const tabs = () =>
    (loaded ??= (async () => {
      const values = area ? await area.get(SESSION_KEY).catch(() => ({})) : {};
      const stored = (values as Record<string, unknown>)[SESSION_KEY];
      return new Set(
        Array.isArray(stored)
          ? stored.filter((id): id is number => typeof id === "number")
          : [],
      );
    })());

  const run = <T>(step: (tabs: Set<number>) => Promise<T> | T) => {
    const next = queue.then(async () => step(await tabs()));
    queue = next.catch(() => undefined);
    return next;
  };

  const write = async (current: Set<number>, tabId: number, on: boolean) => {
    if (current.has(tabId) === on) return;
    if (on) current.add(tabId);
    else current.delete(tabId);
    await area?.set({ [SESSION_KEY]: [...current] }).catch(() => undefined);
  };

  return {
    // After the user's "Translate this page" (on) or "Show original" (off).
    set: (tabId: number, on: boolean) =>
      run((current) => write(current, tabId, on)),
    isOn: (tabId: number) => run((current) => current.has(tabId)),
    // A navigation committed in the tab; a reload ends the mode.
    committed: (details: TabNavigation) =>
      run((current) => {
        if (details.frameId === 0 && details.transitionType === "reload")
          return write(current, details.tabId, false);
      }),
    // The tab's page can be translated: its document is parsed, it moved
    // within the same document, or it finished loading (also a page from the
    // back/forward cache, or one the browser swapped in without navigation
    // events, such as a prerendered page).
    ready: (tabId: number, frameId = 0) =>
      run((current) => {
        // Not awaited: the next event doesn't wait for the page.
        if (frameId === 0 && current.has(tabId))
          void translate(tabId).catch(() => undefined);
      }),
    // A tab opened from `sourceTabId`'s page takes its mode. Its page is
    // translated when it is ready, like any later page.
    opened: (tabId: number, sourceTabId: number) =>
      run((current) =>
        current.has(sourceTabId) ? write(current, tabId, true) : undefined,
      ),
    removed: (tabId: number) => run((current) => write(current, tabId, false)),
    // The browser put another tab in place of `removedId`.
    replaced: (addedId: number, removedId: number) =>
      run(async (current) => {
        if (!current.has(removedId)) return;
        await write(current, removedId, false);
        await write(current, addedId, true);
        void translate(addedId).catch(() => undefined);
      }),
  };
}

export type TranslateMode = ReturnType<typeof createTranslateMode>;

// The background's translate mode, following the browser's tab and
// navigation events.
export function watchTranslateMode(
  translate: (tabId: number) => Promise<unknown>,
) {
  const api = getBrowserApi();
  const mode = createTranslateMode({ area: api.storage.session, translate });
  const navigation = api.webNavigation;
  navigation?.onCommitted.addListener(
    (details) => void mode.committed(details).catch(() => undefined),
  );
  const ready = (details: TabNavigation) =>
    void mode.ready(details.tabId, details.frameId).catch(() => undefined);
  // Where the browser says which page opened a tab; tabs.onCreated's
  // opener is the active tab, not always the page that opened it.
  navigation?.onCreatedNavigationTarget.addListener(
    (details) =>
      void mode
        .opened(details.tabId, details.sourceTabId)
        .catch(() => undefined),
  );
  navigation?.onDOMContentLoaded.addListener(ready);
  navigation?.onHistoryStateUpdated.addListener(ready);
  navigation?.onReferenceFragmentUpdated.addListener(ready);
  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "complete")
      void mode.ready(tabId).catch(() => undefined);
  });
  api.tabs.onRemoved.addListener(
    (tabId) => void mode.removed(tabId).catch(() => undefined),
  );
  api.tabs.onReplaced?.addListener(
    (addedId, removedId) =>
      void mode.replaced(addedId, removedId).catch(() => undefined),
  );
  return mode;
}
