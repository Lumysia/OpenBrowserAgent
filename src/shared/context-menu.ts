// The right-click menu: its settings and the items it shows.

// Items in menu order, as the settings name them.
export const CONTEXT_MENU_ITEM = {
  ask: "ask",
  summarizePage: "summarizePage",
  translatePage: "translatePage",
  searchWeb: "searchWeb",
  summarizeLink: "summarizeLink",
  copyMarkdown: "copyMarkdown",
} as const;

export type ContextMenuItem =
  (typeof CONTEXT_MENU_ITEM)[keyof typeof CONTEXT_MENU_ITEM];

export const CONTEXT_MENU_ITEMS = Object.values(CONTEXT_MENU_ITEM);

export type ContextMenuSettings = {
  enabled: boolean;
  // Turned-off items, so items added later show by default.
  disabledItems: ContextMenuItem[];
};

export const DEFAULT_CONTEXT_MENU_SETTINGS: ContextMenuSettings = {
  enabled: true,
  disabledItems: [],
};

export function normalizeContextMenuSettings(
  value: Partial<ContextMenuSettings> | undefined,
): ContextMenuSettings {
  const items = new Set<string>(CONTEXT_MENU_ITEMS);
  const disabled = Array.isArray(value?.disabledItems)
    ? value.disabledItems.filter((item) => items.has(item))
    : [];
  return {
    enabled: value?.enabled !== false,
    disabledItems: [...new Set(disabled)],
  };
}

// Menu item ids. "Search the web" is two entries: one with the selected text
// in its title, one for everything else.
export const CONTEXT_MENU_ID = {
  parent: "oba-menu",
  ask: "oba-ask",
  summarizePage: "oba-summarize-page",
  translatePage: "oba-translate-page",
  searchPage: "oba-search-page",
  searchSelection: "oba-search-selection",
  summarizeLink: "oba-summarize-link",
  copyMarkdown: "oba-copy-markdown",
} as const;

export type ContextMenuId =
  (typeof CONTEXT_MENU_ID)[keyof typeof CONTEXT_MENU_ID];

export type ContextMenuTitles = {
  parent: string;
  ask: string;
  summarizePage: string;
  // "Translate this page", or "Show original" where the active tab is
  // translated.
  translatePage: string;
  searchPage: string;
  // `%s` stands for the selected text.
  searchSelection: string;
  summarizeLink: string;
  copyMarkdown: string;
};

export type ContextMenuEntry = {
  id: ContextMenuId;
  parentId?: ContextMenuId;
  title: string;
  contexts: string[];
};

// Every context on a web page; `all` leaves out the tab strip.
const ANYWHERE = ["all"];
// `all` without the selection, which has its own search entry.
const NOT_SELECTION = [
  "page",
  "frame",
  "link",
  "image",
  "video",
  "audio",
  "editable",
];

// What to create, in order; empty when the menu is off or every item is.
// `tabContext`: whether the browser has the tab strip's menu. Children list
// their contexts themselves: Chrome and Safari do not inherit them.
export function contextMenuEntries(
  settings: ContextMenuSettings,
  titles: ContextMenuTitles,
  { tabContext }: { tabContext: boolean },
): ContextMenuEntry[] {
  if (!settings.enabled) return [];
  const on = (item: ContextMenuItem) => !settings.disabledItems.includes(item);
  const tab = tabContext ? ["tab"] : [];
  const parentId = CONTEXT_MENU_ID.parent;
  const child = (id: ContextMenuId, title: string, contexts: string[]) => ({
    id,
    parentId,
    title: menuTitle(title),
    contexts,
  });
  const children: ContextMenuEntry[] = [
    ...(on(CONTEXT_MENU_ITEM.ask)
      ? [child(CONTEXT_MENU_ID.ask, titles.ask, [...ANYWHERE, ...tab])]
      : []),
    ...(on(CONTEXT_MENU_ITEM.summarizePage)
      ? [
          child(CONTEXT_MENU_ID.summarizePage, titles.summarizePage, [
            ...ANYWHERE,
            ...tab,
          ]),
        ]
      : []),
    ...(on(CONTEXT_MENU_ITEM.translatePage)
      ? [
          child(CONTEXT_MENU_ID.translatePage, titles.translatePage, [
            ...ANYWHERE,
            ...tab,
          ]),
        ]
      : []),
    ...(on(CONTEXT_MENU_ITEM.searchWeb)
      ? [
          child(CONTEXT_MENU_ID.searchPage, titles.searchPage, [
            ...NOT_SELECTION,
            ...tab,
          ]),
          child(CONTEXT_MENU_ID.searchSelection, titles.searchSelection, [
            "selection",
          ]),
        ]
      : []),
    ...(on(CONTEXT_MENU_ITEM.summarizeLink)
      ? [child(CONTEXT_MENU_ID.summarizeLink, titles.summarizeLink, ["link"])]
      : []),
    ...(on(CONTEXT_MENU_ITEM.copyMarkdown)
      ? [
          child(CONTEXT_MENU_ID.copyMarkdown, titles.copyMarkdown, [
            ...ANYWHERE,
            ...tab,
          ]),
        ]
      : []),
  ];
  if (!children.length) return [];
  return [
    {
      id: parentId,
      title: menuTitle(titles.parent),
      contexts: [...ANYWHERE, ...tab],
    },
    ...children,
  ];
}

// `&` marks an access key in menu titles; a literal one is doubled.
function menuTitle(title: string) {
  return title.replaceAll("&", "&&");
}
