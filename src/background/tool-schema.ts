export const browserTools = [
  tool("openNewTabWithURL", "Open a new tab with the given URL", {
    url: { type: "string", description: "The URL to open in a new tab" },
    reason: {
      type: "string",
      description:
        "The reason to open the new tab. It should be relevant to the USER's query. SHOULD use USER's language.",
    },
  }),
  tool("getCurrentTab", "Get current active tab", {}),
  tool("goToTab", "Go to a tab by ID", {
    tabId: { type: "number", description: "The ID of the tab to go to" },
  }),
  tool("insertCSSToTab", "Insert CSS to a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to insert CSS to",
    },
    css: { type: "string", description: "The CSS to insert" },
  }),
  tool("removeCSSToTab", "Remove CSS from a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to remove CSS from",
    },
    css: { type: "string", description: "The CSS to remove" },
  }),
  tool("getTabContent", "Get the markdown content of a list of tabs", {
    tabIds: {
      type: "array",
      items: { type: "number" },
      description: "The IDs of the tabs to get the content of",
    },
  }),
  tool("getAllTabs", "Get all tabs", {}),
  tool("closeTab", "Close tabs by ID", {
    tabIds: {
      type: "array",
      items: { type: "number" },
      description: "The IDs of the tabs to close",
    },
  }),
  tool("openSearchTab", "Open a search tab with the given query", {
    query: { type: "string", description: "The search query" },
  }),
  tool("waitTabLoadFinished", "Wait for a tab to finish loading", {
    tabId: { type: "number", description: "The ID of the tab to wait for" },
  }),
  tool("clickElementByAiID", "Click an element by its AI ID", {
    id: { type: "string", description: "The ID of the element to click" },
    tabId: {
      type: "number",
      description: "The ID of the tab to click the element in",
    },
  }),
  tool("inputTextByAiID", "Input text into an element by its AI ID", {
    id: {
      type: "string",
      description: "The ID of the element to input text into",
    },
    tabId: {
      type: "number",
      description: "The ID of the tab to input text into",
    },
    text: { type: "string", description: "The text to input into the element" },
  }),
  tool(
    "findAccessableElementsFromTab",
    "Find all accessible elements from a tab",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to find accessible elements from",
      },
    },
  ),
  tool("getElementPropertiesByAiID", "Get element properties by AI ID", {
    tabId: {
      type: "number",
      description: "The ID of the tab that the elements are in",
    },
    ids: {
      type: "array",
      items: { type: "string" },
      description: "The ai-ids of the elements",
    },
  }),
  tool(
    "groupTabs",
    "Group tabs with title and optional color",
    {
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "The IDs of the tabs to group",
      },
      title: { type: "string", description: "The title of the tab group" },
      color: { type: "string", description: "The color of the tab group" },
    },
    ["tabIds", "title"],
  ),
  tool("scrollToBottom", "Scroll to the bottom of a tab", {
    tabId: { type: "number", description: "The ID of the tab to scroll" },
  }),
  tool("downloadTabToMarkdown", "Download a tab to markdown", {
    tabId: { type: "number", description: "The ID of the tab to download" },
  }),
  tool("downloadAllImagesInTab", "Download all images in a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to download images from",
    },
  }),
];

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}
