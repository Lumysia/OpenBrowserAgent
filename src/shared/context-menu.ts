import { knownValues } from "./values";
// The right-click menu: its settings and the items it shows.

// Items in menu order, as the settings name them.
export const CONTEXT_MENU_ITEM = {
  ask: "ask",
  summarizePage: "summarizePage",
  translateSelection: "translateSelection",
  translatePage: "translatePage",
  translateSubtitles: "translateSubtitles",
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
  return {
    enabled: value?.enabled !== false,
    disabledItems: knownValues(CONTEXT_MENU_ITEMS, value?.disabledItems),
  };
}

// Menu item ids. "Ask" and "Search the web" are two entries each: one with
// the selected text in its title, one for everything else.
export const CONTEXT_MENU_ID = {
  parent: "oba-menu",
  ask: "oba-ask",
  askSelection: "oba-ask-selection",
  summarizePage: "oba-summarize-page",
  translateSelection: "oba-translate-selection",
  translatePage: "oba-translate-page",
  translateSubtitles: "oba-translate-subtitles",
  searchPage: "oba-search-page",
  searchSelection: "oba-search-selection",
  summarizeLink: "oba-summarize-link",
  copyMarkdown: "oba-copy-markdown",
} as const;

type ContextMenuId = (typeof CONTEXT_MENU_ID)[keyof typeof CONTEXT_MENU_ID];

type ContextMenuTitles = {
  parent: string;
  ask: string;
  // `%s` stands for the selected text, here and below.
  askSelection: string;
  summarizePage: string;
  // The smart bar's Translate on the selection.
  translateSelection: string;
  // "Translate this page", or "Show original" where the active tab is
  // translated.
  translatePage: string;
  // On a video: starts or stops its translated subtitles.
  translateSubtitles: string;
  searchPage: string;
  searchSelection: string;
  summarizeLink: string;
  copyMarkdown: string;
};

export type ContextMenuEntry = {
  id: string;
  parentId?: string;
  title: string;
  contexts: string[];
  type?: "normal" | "checkbox" | "radio";
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
};

// Every context on a web page; `all` leaves out the tab strip.
const ANYWHERE = ["all"];
// `all` without the selection: it has entries of its own, and actions on
// the whole page (summarize, copy) don't show there.
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
      ? [
          child(CONTEXT_MENU_ID.ask, titles.ask, [...NOT_SELECTION, ...tab]),
          child(CONTEXT_MENU_ID.askSelection, titles.askSelection, [
            "selection",
          ]),
        ]
      : []),
    ...(on(CONTEXT_MENU_ITEM.summarizePage)
      ? [
          child(CONTEXT_MENU_ID.summarizePage, titles.summarizePage, [
            ...NOT_SELECTION,
            ...tab,
          ]),
        ]
      : []),
    ...(on(CONTEXT_MENU_ITEM.translateSelection)
      ? [
          child(CONTEXT_MENU_ID.translateSelection, titles.translateSelection, [
            "selection",
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
    ...(on(CONTEXT_MENU_ITEM.translateSubtitles)
      ? [
          child(CONTEXT_MENU_ID.translateSubtitles, titles.translateSubtitles, [
            "video",
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
            ...NOT_SELECTION,
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
export function menuTitle(title: string) {
  return title.replaceAll("&", "&&");
}
