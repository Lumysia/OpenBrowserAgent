import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { ATTACHMENT_TOOL_DESCRIPTION } from "../shared/attachments";
import { isAskMode, type ChatMode } from "../shared/types";
import { cdpTools } from "./cdp-tool-schema";

export const deferredBrowserTools = cdpTools;

export const loaderBrowserTools = [
  tool(
    BROWSER_TOOL_NAME.loadBrowserTools,
    "Load deferred browser automation tool schemas by name or search query. Use this when common tools are insufficient. After loading, call the specific loaded tool directly in the next step.",
    {
      names: {
        type: "array",
        items: { type: "string" },
        description:
          "Exact deferred tool names to load, if known. Examples: cdpTakeScreenshot, cdpEvaluateScript.",
      },
      query: {
        type: "string",
        description:
          "Natural-language search query for relevant deferred browser tools.",
      },
      category: {
        type: "string",
        description:
          "Optional category filter, such as cdp, input, navigation, debug, network, performance, memory.",
      },
    },
    [],
  ),
];

export const commonBrowserTools = [
  tool(
    BROWSER_TOOL_NAME.wait,
    "Pause before continuing when the user/page, animation, or async action needs time to settle.",
    {
      milliseconds: {
        type: "number",
        description:
          "How long to wait in milliseconds. Defaults to 1000 and is capped by the extension safety limit.",
      },
      reason: {
        type: "string",
        description:
          "Why waiting is useful for this task. SHOULD use USER's language.",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.getCurrentTime,
    "Get current date/time from the user's device for exact local time/date or time zone conversion.",
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
    "Create, generate, draw, or edit an image. Uploaded images/text can be references.",
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
    "Download tab images as a zip for the user. Not for visual inspection; use readFileFromUrl for that.",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to download images from",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.readFileFromUrl,
    "Fetch/read a file URL. Use before visual claims about image URLs. Images become vision input; text returns as text; binary can return base64/hex slices.",
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
    "Update/add a skill text file only for generalized reusable improvements. Never add secrets or one-off task details.",
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
export const browserTools = [...commonBrowserTools, ...loaderBrowserTools];

export function browserToolsForPrompt({
  mode,
  hasUploadedAttachments,
  hasSkills,
  imageGenerationEnabled,
  cdpToolsEnabled,
  dangerousCodeExecutionEnabled,
  latestUserText,
  loadedToolNames = [],
}: {
  mode: ChatMode;
  hasUploadedAttachments: boolean;
  hasSkills: boolean;
  imageGenerationEnabled: boolean;
  cdpToolsEnabled: boolean;
  dangerousCodeExecutionEnabled: boolean;
  latestUserText?: string;
  loadedToolNames?: string[];
}) {
  const askMode = isAskMode(mode);
  const loadedTools = deferredBrowserTools.filter((tool) =>
    loadedToolNames.includes(tool.function.name),
  );
  return [...browserTools, ...loadedTools].filter((item) => {
    const name = item.function.name;
    if (name === BROWSER_TOOL_NAME.loadBrowserTools) return !askMode;
    if (name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript)
      return dangerousCodeExecutionEnabled;
    if (name.startsWith("cdp") && !cdpToolsEnabled) return false;
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return hasUploadedAttachments;
    if (name === BROWSER_TOOL_NAME.listSkills) return hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkill) return hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkillFile) return hasSkills;
    if (name === BROWSER_TOOL_NAME.updateSkillFile) return hasSkills;
    if (name === BROWSER_TOOL_NAME.generateImage) return imageGenerationEnabled;
    if (name === BROWSER_TOOL_NAME.getCurrentTime) return !askMode;
    if (name === BROWSER_TOOL_NAME.readFileFromUrl)
      return !askMode || containsFileUrl(latestUserText || "");
    return !askMode;
  });
}

function containsFileUrl(text: string) {
  return /https?:\/\/\S+|data:image\//i.test(text);
}

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
