export const BROWSER_TOOL_NAME = {
  openNewTabWithURL: "openNewTabWithURL",
  getCurrentTab: "getCurrentTab",
  goToTab: "goToTab",
  insertCSSToTab: "insertCSSToTab",
  removeCSSToTab: "removeCSSToTab",
  getTabContent: "getTabContent",
  getAllTabs: "getAllTabs",
  closeTab: "closeTab",
  openSearchTab: "openSearchTab",
  waitTabLoadFinished: "waitTabLoadFinished",
  clickElementByAiID: "clickElementByAiID",
  inputTextByAiID: "inputTextByAiID",
  findAccessableElementsFromTab: "findAccessableElementsFromTab",
  getElementPropertiesByAiID: "getElementPropertiesByAiID",
  groupTabs: "groupTabs",
  scrollToBottom: "scrollToBottom",
  downloadTabToMarkdown: "downloadTabToMarkdown",
  downloadAllImagesInTab: "downloadAllImagesInTab",
  readUploadedAttachment: "readUploadedAttachment",
} as const;

export type BrowserToolName =
  (typeof BROWSER_TOOL_NAME)[keyof typeof BROWSER_TOOL_NAME];

export const UNKNOWN_TOOL_NAME = "unknown";
