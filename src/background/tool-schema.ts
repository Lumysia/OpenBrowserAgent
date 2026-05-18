import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { ATTACHMENT_TOOL_DESCRIPTION } from "../shared/attachments";

export const browserTools = [
  tool(
    BROWSER_TOOL_NAME.openNewTabWithURL,
    "Open a new tab with the given URL",
    {
      url: { type: "string", description: "The URL to open in a new tab" },
      reason: {
        type: "string",
        description:
          "The reason to open the new tab. It should be relevant to the USER's query. SHOULD use USER's language.",
      },
    },
  ),
  tool(BROWSER_TOOL_NAME.getCurrentTab, "Get current active tab", {}),
  tool(BROWSER_TOOL_NAME.goToTab, "Go to a tab by ID", {
    tabId: { type: "number", description: "The ID of the tab to go to" },
  }),
  tool(BROWSER_TOOL_NAME.insertCSSToTab, "Insert CSS to a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to insert CSS to",
    },
    css: { type: "string", description: "The CSS to insert" },
  }),
  tool(BROWSER_TOOL_NAME.removeCSSToTab, "Remove CSS from a tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to remove CSS from",
    },
    css: { type: "string", description: "The CSS to remove" },
  }),
  tool(
    BROWSER_TOOL_NAME.getTabContent,
    "Get the markdown content of a list of tabs",
    {
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "The IDs of the tabs to get the content of",
      },
    },
  ),
  tool(BROWSER_TOOL_NAME.getAllTabs, "Get all tabs", {}),
  tool(BROWSER_TOOL_NAME.closeTab, "Close tabs by ID", {
    tabIds: {
      type: "array",
      items: { type: "number" },
      description: "The IDs of the tabs to close",
    },
  }),
  tool(
    BROWSER_TOOL_NAME.openSearchTab,
    "Open a search tab with the given query",
    {
      query: { type: "string", description: "The search query" },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.waitTabLoadFinished,
    "Wait for a tab to finish loading",
    {
      tabId: { type: "number", description: "The ID of the tab to wait for" },
    },
  ),
  tool(BROWSER_TOOL_NAME.clickElementByAiID, "Click an element by its AI ID", {
    id: { type: "string", description: "The ID of the element to click" },
    tabId: {
      type: "number",
      description: "The ID of the tab to click the element in",
    },
  }),
  tool(
    BROWSER_TOOL_NAME.inputTextByAiID,
    "Input text into an element by its AI ID",
    {
      id: {
        type: "string",
        description: "The ID of the element to input text into",
      },
      tabId: {
        type: "number",
        description: "The ID of the tab to input text into",
      },
      text: {
        type: "string",
        description: "The text to input into the element",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.findAccessableElementsFromTab,
    "Find all accessible elements from a tab",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to find accessible elements from",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.getElementPropertiesByAiID,
    "Get element properties by AI ID",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab that the elements are in",
      },
      ids: {
        type: "array",
        items: { type: "string" },
        description: "The ai-ids of the elements",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.groupTabs,
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
  tool(BROWSER_TOOL_NAME.scrollToBottom, "Scroll to the bottom of a tab", {
    tabId: { type: "number", description: "The ID of the tab to scroll" },
  }),
  tool(BROWSER_TOOL_NAME.downloadTabToMarkdown, "Download a tab to markdown", {
    tabId: { type: "number", description: "The ID of the tab to download" },
  }),
  tool(
    BROWSER_TOOL_NAME.downloadAllImagesInTab,
    "Download all images in a tab",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to download images from",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.readUploadedAttachment,
    ATTACHMENT_TOOL_DESCRIPTION.readUploadedAttachment,
    {
      attachmentId: {
        type: "string",
        description: ATTACHMENT_TOOL_DESCRIPTION.attachmentId,
      },
      offset: {
        type: "number",
        description: ATTACHMENT_TOOL_DESCRIPTION.offset,
      },
      limit: { type: "number", description: ATTACHMENT_TOOL_DESCRIPTION.limit },
      format: {
        type: "string",
        enum: ["text", "base64", "hex"],
        description: ATTACHMENT_TOOL_DESCRIPTION.format,
      },
    },
    ["attachmentId"],
  ),
  tool(
    BROWSER_TOOL_NAME.listSkills,
    "List available skill packages. Call this before readSkill when skills may help the user request.",
    {},
  ),
  tool(
    BROWSER_TOOL_NAME.readSkill,
    "Read SKILL.md for one available skill package by id after listSkills shows it is relevant.",
    {
      skillId: {
        type: "string",
        description: "The id of the available skill to read",
      },
    },
    ["skillId"],
  ),
  tool(
    BROWSER_TOOL_NAME.readSkillFile,
    "Read a supporting file from an available skill package by id and path after reading SKILL.md.",
    {
      skillId: {
        type: "string",
        description: "The id of the available skill package",
      },
      path: {
        type: "string",
        description: "The skill file path, such as references/example.md",
      },
    },
    ["skillId", "path"],
  ),
  tool(
    BROWSER_TOOL_NAME.updateSkillFile,
    "Update or add a text file in an available skill package after using it. Only make generalized, reusable improvements based on the current context; do not add narrow one-off details, user-specific secrets, or task-only hacks.",
    {
      skillId: {
        type: "string",
        description: "The id of the available skill package to update",
      },
      path: {
        type: "string",
        description:
          "The skill file path to update, such as SKILL.md or references/example.md",
      },
      content: {
        type: "string",
        description: "The complete new UTF-8 text content for this skill file",
      },
      reason: {
        type: "string",
        description:
          "Why this update is broadly reusable and not a narrow one-off change",
      },
    },
    ["skillId", "path", "content", "reason"],
  ),
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
