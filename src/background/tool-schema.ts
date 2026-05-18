import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { ATTACHMENT_TOOL_DESCRIPTION } from "../shared/attachments";
import { cdpTools } from "./cdp-tool-schema";

export const catalogBrowserTools = [
  tool(
    BROWSER_TOOL_NAME.listBrowserTools,
    "List available browser automation tools by category. Use this to discover less common tools without loading every schema into the prompt.",
    {
      category: {
        type: "string",
        description:
          "Optional category filter, such as common, cdp, input, navigation, debug, network, performance, memory, files, skills, image",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.readBrowserTool,
    "Read details and JSON schema for a browser automation tool from the tool catalog.",
    {
      name: {
        type: "string",
        description: "Tool name returned by listBrowserTools",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.runBrowserTool,
    "Run a browser automation tool by name after checking its details with readBrowserTool. Use this for less common tools that are not directly exposed.",
    {
      name: { type: "string", description: "Tool name to run" },
      arguments: {
        type: "object",
        description: "Arguments matching readBrowserTool schema",
      },
    },
  ),
];

export const commonBrowserTools = [
  tool(
    BROWSER_TOOL_NAME.getCurrentTime,
    "Get the current date and time from the user's device. Use this when the user asks what time it is, asks for today's exact local date/time, or needs time zone conversion.",
    {
      timeZone: {
        type: "string",
        description:
          "Optional IANA time zone, such as America/New_York or Asia/Tokyo. Defaults to the user's device time zone.",
      },
      locale: {
        type: "string",
        description:
          "Optional BCP 47 locale for formatted output, such as en-US or zh-CN. Defaults to the browser locale.",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.generateImage,
    "Use this for user requests to create, generate, draw, or edit an image with the configured image generation model. Can use uploaded image attachments as visual references and uploaded text attachments as prompt references.",
    {
      prompt: {
        type: "string",
        description: "Detailed image generation/editing prompt",
      },
      referenceAttachmentIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional uploaded attachment ids to use as references. Image attachments are visual references; text attachments are appended as reference text.",
      },
      modelId: {
        type: "string",
        description:
          "Optional configured image model id. Defaults to the selected image model.",
      },
      size: {
        type: "string",
        description: "Optional image size, such as 1024x1024",
      },
      quality: { type: "string", description: "Optional quality setting" },
      count: { type: "number", description: "Optional image count" },
    },
    ["prompt"],
  ),
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
    BROWSER_TOOL_NAME.cdpMouseActionByAiID,
    "Dispatch a CDP mouse action on an element by its AI ID when DOM click tools do not trigger the page",
    {
      id: {
        type: "string",
        description: "The ID of the element to target",
      },
      tabId: {
        type: "number",
        description: "The ID of the tab containing the element",
      },
      action: {
        type: "string",
        enum: ["hover", "click", "doubleClick"],
        description: "The CDP mouse action to perform",
      },
    },
    ["id", "tabId"],
  ),
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
    "Download all images in a tab as a zip for the user. Do not use this to visually inspect or describe image content; use readFileFromUrl when you have an image/file URL that the model needs to read.",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to download images from",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.readFileFromUrl,
    "Fetch a file URL and read it according to its type. Use this before making visual claims when the user asks to see, inspect, judge, choose, or describe an image from a URL. Images are attached to the next model call as vision input; text is returned as text; other binary files can be returned as base64 or hex slices for model/tool inspection.",
    {
      url: {
        type: "string",
        description:
          "The file URL to fetch. Supports http(s) and data URLs. Blob URLs may only work when they are accessible from the current execution context.",
      },
      format: {
        type: "string",
        enum: ["auto", "text", "base64", "hex"],
        description:
          "How to read the file. auto uses vision for images, text for textual files, and base64 metadata for binary files.",
      },
      offset: {
        type: "number",
        description: "Zero-based character offset for text/base64/hex output",
      },
      limit: {
        type: "number",
        description: "Maximum characters to return for text/base64/hex output",
      },
      reason: {
        type: "string",
        description:
          "Why this file needs to be read. SHOULD use USER's language.",
      },
    },
    ["url"],
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

export const allBrowserTools = [...commonBrowserTools, ...cdpTools];
export const browserTools = [...commonBrowserTools, ...catalogBrowserTools];

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
