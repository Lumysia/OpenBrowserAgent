// The page translation button on an edge of the page: its messages and
// the state it shares with the page translation script. Dependency-free
// (types only) for the page scripts.
import type { PageToastTheme } from "../page-toast";

// Marks the button's host element in the page, so our page scripts (and
// tests) can tell it from the page's own nodes.
export const PAGE_BUTTON_HOST_ATTRIBUTE = "data-oba-page-button";

// Page -> background (runtime.sendMessage).
export const PAGE_BUTTON_MESSAGE = {
  // What the button shows. Answers PageButtonConfig.
  config: "page-translate-button:config",
  // Translate the page or show the original, as the menu item does.
  // Answers `{ ok: boolean }` once the page has started or stopped.
  toggle: "page-translate-button:toggle",
  hideOnSite: "page-translate-button:hide-on-site",
  // Turns the button off in Settings.
  hideEverywhere: "page-translate-button:hide-everywhere",
  // Where the user dragged it: PageButtonPositionMessage.
  position: "page-translate-button:position",
} as const;

export type PageButtonPositionMessage = {
  type: typeof PAGE_BUTTON_MESSAGE.position;
  position: PageButtonPosition;
};

export const PAGE_BUTTON_EDGES = ["left", "right", "top", "bottom"] as const;
export type PageButtonEdge = (typeof PAGE_BUTTON_EDGES)[number];

// The edge the button sits on, and where its middle is along that edge, as a
// fraction of the viewport's height (left, right) or width (top, bottom):
// the same place on any window size.
export type PageButtonPosition = {
  edge: PageButtonEdge;
  along: number;
};

// Its default place: the right edge, two thirds down the viewport.
export const DEFAULT_PAGE_BUTTON_POSITION: PageButtonPosition = {
  edge: "right",
  along: 2 / 3,
};

export function normalizePageButtonPosition(
  value: unknown,
): PageButtonPosition {
  const { edge, along } = (value || {}) as Partial<PageButtonPosition>;
  if (
    !PAGE_BUTTON_EDGES.includes(edge as PageButtonEdge) ||
    typeof along !== "number" ||
    !Number.isFinite(along)
  )
    return DEFAULT_PAGE_BUTTON_POSITION;
  return {
    edge: edge as PageButtonEdge,
    along: Math.min(1, Math.max(0, along)),
  };
}

export type PageButtonConfig = {
  // False where it doesn't show: turned off, or hidden on this site.
  enabled: boolean;
  position: PageButtonPosition;
  labels: {
    translate: string;
    showOriginal: string;
    translating: string;
    // The close control and its two choices.
    hide: string;
    hideOnSite: string;
    hideEverywhere: string;
    // How to move it with the keyboard.
    move: string;
  };
  theme: PageToastTheme;
};

// Shared between the extension's scripts in the top frame (they share the
// isolated world; page scripts can't reach it): whether the page is
// translated, whether a translation is still starting, and who wants to
// know when that changes. The page translation script writes it.
export type PageTranslateShared = {
  translated: boolean;
  starting: boolean;
  listeners: Set<() => void>;
};

const SHARED = Symbol.for("oba.pageTranslate.shared");

export function pageTranslateShared(): PageTranslateShared {
  const scope = globalThis as unknown as Record<symbol, PageTranslateShared>;
  return (scope[SHARED] ??= {
    translated: false,
    starting: false,
    listeners: new Set(),
  });
}

export function setPageTranslateShared(
  change: Partial<Omit<PageTranslateShared, "listeners">>,
) {
  const shared = pageTranslateShared();
  if (
    (change.translated ?? shared.translated) === shared.translated &&
    (change.starting ?? shared.starting) === shared.starting
  )
    return;
  Object.assign(shared, change);
  shared.listeners.forEach((listener) => listener());
}
