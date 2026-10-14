export const contextMenuEnUS = {
  items: {
    ask: "Ask or act on this page",
    summarizePage: "Summarize this page",
    searchPage: "Search the web about this page",
    searchSelection: 'Search the web for "%s"',
    summarizeLink: "Summarize linked page",
    copyMarkdown: "Copy as Markdown",
  },
  searchSelectionRequest: "Search the web about the selected text",
  copied: "Copied as Markdown",
  copyFailed: "Couldn't copy to the clipboard. Click the page and try again.",
  copyUnavailable:
    "Can't copy this page: the browser doesn't let extensions read it.",
  settingsTitle: "Context menu",
  settingsDescription:
    "OpenBrowserAgent actions in the menu that opens when you right-click a page.",
  enable: "Show in the context menu",
  enableDescription:
    "Adds an OpenBrowserAgent submenu when you right-click a page, link, image or selected text.",
  itemsTitle: "Menu items",
  itemsDescription:
    "Actions that open the side panel give the page to your agent. Copy as Markdown works without AI.",
  itemLabels: {
    ask: "Ask or act on this page",
    summarizePage: "Summarize this page",
    searchWeb: "Search the web about this page or the selected text",
    summarizeLink: "Summarize linked page (on links)",
    copyMarkdown: "Copy as Markdown",
  },
};

export type ContextMenuLocaleMessages = typeof contextMenuEnUS;
