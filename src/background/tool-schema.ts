import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { ATTACHMENT_TOOL_DESCRIPTION } from "../shared/attachments";
import { MEMORY_ENTRY_TEXT_MAX_CHARS } from "../shared/config";
import { areCdpToolsAvailable } from "../shared/runtime-capabilities";
import type { AgentCapabilities } from "../shared/types";
import { cdpTools } from "./cdp-tool-schema";

export const deferredBrowserTools = cdpTools;

const contentSliceParameters = {
  offset: {
    type: "number",
    description: "Zero-based character offset for returned content",
  },
  limit: {
    type: "number",
    description: "Maximum characters to return for this read",
  },
} as const;

const listSliceParameters = {
  offset: {
    type: "number",
    description: "Zero-based item offset for returned results",
  },
  limit: {
    type: "number",
    description: "Maximum items to return",
  },
} as const;

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
    "Open a new background tab with the given URL. This does not switch the active browser tab; call goToTab with the returned tab ID if the user needs to see or end on this page.",
    {
      url: {
        type: "string",
        description: "The URL to open in a new background tab",
      },
      reason: {
        type: "string",
        description:
          "The reason to open the new tab. It should be relevant to the USER's query. SHOULD use USER's language.",
      },
    },
  ),
  tool(BROWSER_TOOL_NAME.getCurrentTab, "Get current active tab", {}),
  tool(BROWSER_TOOL_NAME.goToTab, "Focus and switch to a browser tab by ID", {
    tabId: {
      type: "number",
      description: "The ID of the tab to make active and visible",
    },
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
    "Get markdown content for a list of tabs. Large markdown is returned as an offset/limit slice per tab.",
    {
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "The IDs of the tabs to get the content of",
      },
      ...contentSliceParameters,
    },
  ),
  tool(BROWSER_TOOL_NAME.getAllTabs, "Get all tabs with optional pagination", {
    ...listSliceParameters,
  }),
  tool(BROWSER_TOOL_NAME.closeTab, "Close tabs by ID", {
    tabIds: {
      type: "array",
      items: { type: "number" },
      description: "The IDs of the tabs to close",
    },
  }),
  tool(BROWSER_TOOL_NAME.reloadTab, "Reload a browser tab", {
    tabId: {
      type: "number",
      description: "The ID of the tab to reload. Defaults to the active tab.",
    },
    bypassCache: {
      type: "boolean",
      description: "Bypass cache while reloading",
    },
  }),
  tool(
    BROWSER_TOOL_NAME.navigateTab,
    "Navigate a tab by URL, back, forward, or reload",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to navigate. Defaults to active tab.",
      },
      type: {
        type: "string",
        enum: ["url", "back", "forward", "reload"],
        description: "Navigation type",
      },
      url: { type: "string", description: "URL for type=url" },
      bypassCache: {
        type: "boolean",
        description: "Bypass cache for type=reload",
      },
    },
    [],
  ),
  tool(BROWSER_TOOL_NAME.captureVisibleTab, "Capture the visible tab area", {
    tabId: {
      type: "number",
      description: "The tab ID to capture. Defaults to active tab.",
    },
    format: {
      type: "string",
      enum: ["png", "jpeg"],
      description: "Image format. Defaults to png.",
    },
    quality: {
      type: "number",
      description: "JPEG quality from 0 to 100",
    },
  }),
  tool(
    BROWSER_TOOL_NAME.waitForText,
    "Wait until text appears in a tab",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to inspect. Defaults to active tab.",
      },
      text: {
        type: "array",
        items: { type: "string" },
        description: "One or more texts to wait for",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds. Defaults to 5000.",
      },
    },
    ["text"],
  ),
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
    "Find accessible elements from a tab with optional pagination",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to find accessible elements from",
      },
      ...listSliceParameters,
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
    "List available skill packages with optional pagination. Call this before readSkill when skills may help the user request.",
    { ...listSliceParameters },
  ),
  tool(
    BROWSER_TOOL_NAME.createSkill,
    "Create a new reusable skill package when no existing skill fits. Never store secrets or one-off task details.",
    {
      name: {
        type: "string",
        description: "Short reusable skill name",
      },
      description: {
        type: "string",
        description: "What this skill helps with",
      },
      instruction: {
        type: "string",
        description: "Reusable SKILL.md instructions for future tasks",
      },
      reason: {
        type: "string",
        description:
          "Why this new skill is broadly reusable and not a narrow one-off note",
      },
    },
    ["name", "instruction", "reason"],
  ),
  tool(
    BROWSER_TOOL_NAME.readSkill,
    "Read SKILL.md for one available skill package by id after listSkills shows it is relevant.",
    {
      skillId: {
        type: "string",
        description: "The id of the available skill to read",
      },
      ...contentSliceParameters,
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
      ...contentSliceParameters,
    },
    ["skillId", "path"],
  ),
  tool(
    BROWSER_TOOL_NAME.updateSkillFile,
    "Update/add a text file in an existing skill package only. Use createSkill for new skill packages. Never add secrets or one-off task details.",
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
  tool(
    BROWSER_TOOL_NAME.patchSkillFile,
    "Patch an existing skill text file with exact search/replace edits for generalized reusable improvements.",
    {
      skillId: {
        type: "string",
        description: "The id of the available skill package to patch",
      },
      path: {
        type: "string",
        description: "The skill file path to patch, such as SKILL.md",
      },
      replacements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            oldText: {
              type: "string",
              description: "Exact existing text to replace; must match once",
            },
            newText: {
              type: "string",
              description: "Replacement text",
            },
          },
          required: ["oldText", "newText"],
        },
        description: "Exact replacements to apply in order",
      },
      reason: {
        type: "string",
        description:
          "Why this patch is broadly reusable and not a narrow one-off change",
      },
    },
    ["skillId", "path", "replacements", "reason"],
  ),
  tool(
    BROWSER_TOOL_NAME.listWorkspaceFiles,
    "List private files in the current agent workspace with optional pagination.",
    { ...listSliceParameters },
  ),
  tool(
    BROWSER_TOOL_NAME.readWorkspaceFile,
    "Read one private file from the current agent workspace by path.",
    {
      path: { type: "string", description: "Workspace file path" },
      ...contentSliceParameters,
    },
    ["path"],
  ),
  tool(
    BROWSER_TOOL_NAME.writeWorkspaceFile,
    "Create or replace one private text file in the current agent workspace.",
    {
      path: { type: "string", description: "Workspace file path" },
      content: {
        type: "string",
        description: "Complete UTF-8 text content for the workspace file",
      },
    },
    ["path", "content"],
  ),
  tool(
    BROWSER_TOOL_NAME.patchWorkspaceFile,
    "Edit one private workspace file with append, prepend, or exact replacement.",
    {
      path: { type: "string", description: "Workspace file path" },
      operation: {
        type: "string",
        enum: ["replace", "append", "prepend"],
        description: "Patch operation",
      },
      value: {
        type: "string",
        description: "Text to insert or replacement text",
      },
      find: {
        type: "string",
        description: "Exact text to replace when operation is replace",
      },
    },
    ["path", "operation", "value"],
  ),
  tool(
    BROWSER_TOOL_NAME.deleteWorkspaceFile,
    "Delete one private file from the current agent workspace.",
    {
      path: { type: "string", description: "Workspace file path" },
    },
    ["path"],
  ),
  tool(
    BROWSER_TOOL_NAME.searchWorkspaceFiles,
    "Search private current-agent workspace files for text. Returns matching line previews, capped per line and by total result characters.",
    {
      query: { type: "string", description: "Text to search for" },
      ...listSliceParameters,
    },
    ["query"],
  ),
  tool(
    BROWSER_TOOL_NAME.listMemory,
    "List compact long-term memory entries for the current agent with optional pagination.",
    { ...listSliceParameters },
  ),
  tool(
    BROWSER_TOOL_NAME.addMemory,
    "Add a stable long-term fact, decision, or lesson. Do not store secrets or temporary task notes.",
    {
      text: {
        type: "string",
        description: `Short durable memory text, normalized to at most ${MEMORY_ENTRY_TEXT_MAX_CHARS} characters`,
      },
    },
    ["text"],
  ),
  tool(
    BROWSER_TOOL_NAME.updateMemory,
    "Update one existing long-term memory entry by id.",
    {
      id: { type: "string", description: "Memory entry id" },
      text: {
        type: "string",
        description: `Replacement durable memory text, normalized to at most ${MEMORY_ENTRY_TEXT_MAX_CHARS} characters`,
      },
    },
    ["id", "text"],
  ),
  tool(
    BROWSER_TOOL_NAME.removeMemory,
    "Remove one long-term memory entry by id.",
    {
      id: { type: "string", description: "Memory entry id" },
    },
    ["id"],
  ),
  tool(
    BROWSER_TOOL_NAME.listUserProfile,
    "List stable user profile and preference notes for the current agent with optional pagination.",
    { ...listSliceParameters },
  ),
  tool(
    BROWSER_TOOL_NAME.addUserProfileNote,
    "Add a stable user preference or profile note. Do not store secrets or transient task details.",
    {
      text: {
        type: "string",
        description: `Short durable user profile note, normalized to at most ${MEMORY_ENTRY_TEXT_MAX_CHARS} characters`,
      },
    },
    ["text"],
  ),
  tool(
    BROWSER_TOOL_NAME.updateUserProfileNote,
    "Update one existing user profile note by id.",
    {
      id: { type: "string", description: "User profile note id" },
      text: {
        type: "string",
        description: `Replacement user profile note, normalized to at most ${MEMORY_ENTRY_TEXT_MAX_CHARS} characters`,
      },
    },
    ["id", "text"],
  ),
  tool(
    BROWSER_TOOL_NAME.removeUserProfileNote,
    "Remove one user profile note by id.",
    {
      id: { type: "string", description: "User profile note id" },
    },
    ["id"],
  ),
  tool(
    BROWSER_TOOL_NAME.searchChatHistory,
    "Search saved chat history by title and message text.",
    {
      query: { type: "string", description: "Text to search for" },
      offset: { type: "number", description: "Zero-based result offset" },
      limit: { type: "number", description: "Maximum chat results" },
    },
    ["query"],
  ),
  tool(
    BROWSER_TOOL_NAME.readChatThread,
    "Read a saved chat thread by id with truncated message content.",
    {
      chatId: { type: "string", description: "Chat thread id" },
      offset: {
        type: "number",
        description:
          "Zero-based message offset. Defaults to the latest messages when omitted.",
      },
      limit: { type: "number", description: "Maximum messages to return" },
    },
    ["chatId"],
  ),
  tool(
    BROWSER_TOOL_NAME.deleteChatThread,
    "Delete one saved chat thread by id when the user explicitly asks.",
    {
      chatId: { type: "string", description: "Chat thread id" },
    },
    ["chatId"],
  ),
  tool(
    BROWSER_TOOL_NAME.listMcpServers,
    "List configured Streamable HTTP MCP servers.",
    {},
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.addMcpServer,
    "Add and test a Streamable HTTP MCP server configuration. The server is saved only if tools/list succeeds.",
    {
      name: { type: "string", description: "Display name for the MCP server" },
      description: {
        type: "string",
        description: "Optional description of what this MCP server provides",
      },
      url: {
        type: "string",
        description:
          "Streamable HTTP MCP endpoint URL, such as https://example.com/mcp",
      },
      enabled: {
        type: "boolean",
        description:
          "Whether the server is enabled. Only tested servers with discovered tools can be enabled.",
      },
      headers: {
        type: "object",
        description: "Optional HTTP headers, such as Authorization",
      },
    },
    ["name", "url"],
  ),
  tool(
    BROWSER_TOOL_NAME.updateMcpServer,
    "Update a configured Streamable HTTP MCP server. URL/header changes and enable requests are tested before the server can be enabled.",
    {
      serverId: { type: "string", description: "MCP server ID" },
      name: { type: "string", description: "New display name" },
      description: {
        type: "string",
        description: "New description of what this MCP server provides",
      },
      url: {
        type: "string",
        description: "New Streamable HTTP MCP endpoint URL",
      },
      enabled: {
        type: "boolean",
        description:
          "Whether the server is enabled. Only tested servers with discovered tools can be enabled.",
      },
      headers: { type: "object", description: "Replacement HTTP headers" },
    },
    ["serverId"],
  ),
  tool(
    BROWSER_TOOL_NAME.testMcpServer,
    "Test a configured MCP server and refresh its available tools list.",
    {
      serverId: { type: "string", description: "MCP server ID" },
    },
    ["serverId"],
  ),
  tool(
    BROWSER_TOOL_NAME.deleteMcpServer,
    "Delete a configured MCP server.",
    {
      serverId: { type: "string", description: "MCP server ID" },
    },
    ["serverId"],
  ),
];

export const allBrowserTools = [...commonBrowserTools, ...cdpTools];
export const browserTools = [...commonBrowserTools, ...loaderBrowserTools];

export function browserToolsForPrompt({
  capabilities,
  hasUploadedAttachments,
  hasSkills,
  hasWorkspace,
  imageGenerationEnabled,
  latestUserText,
  loadedToolNames = [],
  cdpToolsAvailable = areCdpToolsAvailable(),
}: {
  capabilities: AgentCapabilities;
  hasUploadedAttachments: boolean;
  hasSkills: boolean;
  hasWorkspace: boolean;
  imageGenerationEnabled: boolean;
  latestUserText?: string;
  loadedToolNames?: string[];
  cdpToolsAvailable?: boolean;
}) {
  const loadedTools = deferredBrowserTools.filter(
    (tool) =>
      capabilities.deferredBrowserTools &&
      cdpToolsAvailable &&
      loadedToolNames.includes(tool.function.name),
  );
  return [...browserTools, ...loadedTools].filter((item) => {
    const name = item.function.name;
    if (!capabilities.browserTools) return false;
    if (name === BROWSER_TOOL_NAME.loadBrowserTools)
      return capabilities.deferredBrowserTools && cdpToolsAvailable;
    if (name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript)
      return (
        capabilities.cdpTools &&
        capabilities.javascriptExecution &&
        cdpToolsAvailable
      );
    if (name.startsWith("cdp"))
      return capabilities.cdpTools && cdpToolsAvailable;
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return hasUploadedAttachments;
    if (name === BROWSER_TOOL_NAME.listSkills)
      return capabilities.skillTools && hasSkills;
    if (name === BROWSER_TOOL_NAME.createSkill)
      return capabilities.skillTools && capabilities.skillCreation;
    if (name === BROWSER_TOOL_NAME.readSkill)
      return capabilities.skillTools && hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkillFile)
      return capabilities.skillTools && hasSkills;
    if (name === BROWSER_TOOL_NAME.updateSkillFile)
      return capabilities.skillTools && hasSkills && capabilities.skillCreation;
    if (name === BROWSER_TOOL_NAME.patchSkillFile)
      return capabilities.skillTools && hasSkills && capabilities.skillCreation;
    if (
      name === BROWSER_TOOL_NAME.listWorkspaceFiles ||
      name === BROWSER_TOOL_NAME.readWorkspaceFile ||
      name === BROWSER_TOOL_NAME.searchWorkspaceFiles
    )
      return capabilities.workspaceRead && hasWorkspace;
    if (
      name === BROWSER_TOOL_NAME.writeWorkspaceFile ||
      name === BROWSER_TOOL_NAME.patchWorkspaceFile ||
      name === BROWSER_TOOL_NAME.deleteWorkspaceFile
    )
      return capabilities.workspaceWrite && hasWorkspace;
    if (
      name === BROWSER_TOOL_NAME.listMemory ||
      name === BROWSER_TOOL_NAME.listUserProfile
    )
      return capabilities.memoryRead && hasWorkspace;
    if (
      name === BROWSER_TOOL_NAME.addMemory ||
      name === BROWSER_TOOL_NAME.updateMemory ||
      name === BROWSER_TOOL_NAME.removeMemory ||
      name === BROWSER_TOOL_NAME.addUserProfileNote ||
      name === BROWSER_TOOL_NAME.updateUserProfileNote ||
      name === BROWSER_TOOL_NAME.removeUserProfileNote
    )
      return capabilities.memoryWrite && hasWorkspace;
    if (
      name === BROWSER_TOOL_NAME.searchChatHistory ||
      name === BROWSER_TOOL_NAME.readChatThread
    )
      return capabilities.chatHistoryRead && hasWorkspace;
    if (name === BROWSER_TOOL_NAME.deleteChatThread)
      return capabilities.chatHistoryWrite;
    if (
      name === BROWSER_TOOL_NAME.listMcpServers ||
      name === BROWSER_TOOL_NAME.addMcpServer ||
      name === BROWSER_TOOL_NAME.updateMcpServer ||
      name === BROWSER_TOOL_NAME.testMcpServer ||
      name === BROWSER_TOOL_NAME.deleteMcpServer
    )
      return capabilities.mcpManagement;
    if (name === BROWSER_TOOL_NAME.generateImage)
      return capabilities.imageGeneration && imageGenerationEnabled;
    if (name === BROWSER_TOOL_NAME.getCurrentTime)
      return capabilities.currentTime;
    if (name === BROWSER_TOOL_NAME.readFileFromUrl)
      return capabilities.fileUrlRead || containsFileUrl(latestUserText || "");
    return capabilities.browserAutomation;
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
