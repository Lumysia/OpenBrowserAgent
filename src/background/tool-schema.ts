import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { ATTACHMENT_TOOL_DESCRIPTION } from "../shared/attachments";
import { MEMORY_ENTRY_TEXT_MAX_CHARS } from "../shared/config";
import { areCdpToolsAvailable } from "../shared/runtime-capabilities";
import type { AgentCapabilities } from "../shared/types";
import { cdpTools } from "./cdp-tool-schema";
import { localExecutionBridgeTools } from "./local-execution-bridge-tool-schema";

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
    BROWSER_TOOL_NAME.loadTools,
    "Load deferred tool schemas by name, category, or search query. Use this when common tools are insufficient. After loading, call the specific loaded tool directly in the next step.",
    {
      operation: {
        type: "string",
        enum: ["load", "list"],
        description:
          "Use list to inspect all deferred tools and unavailable reasons without loading schemas. Use load to load matching schemas. Defaults to load.",
      },
      names: {
        type: "array",
        items: { type: "string" },
        description:
          "Exact deferred tool names to load, if known. Examples: manageSkills, workspaceFiles, manageMcpServers, cdpInput.",
      },
      query: {
        type: "string",
        description:
          "Natural-language search query for relevant deferred tools.",
      },
      category: {
        type: "string",
        description:
          "Optional category filter, such as cdp, skills, workspace, memory, history, mcp, bridges, agents.",
      },
    },
    [],
  ),
];

export const commonBrowserTools = [
  tool(
    BROWSER_TOOL_NAME.question,
    "Ask the user structured questions when required information is missing. Use this instead of guessing user preferences or blocking setup in free-form text. Supports 1-6 questions, single-select, multi-select, and an optional custom answer field.",
    {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        description: "Questions to ask the user in one compact prompt.",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "Complete question text in the user's language.",
            },
            options: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              description: "Available choices.",
              items: {
                type: "object",
                properties: {
                  label: {
                    type: "string",
                    description: "Choice text, ideally 1-5 words.",
                  },
                  description: {
                    type: "string",
                    description: "Optional short explanation for the choice.",
                  },
                },
                required: ["label"],
              },
            },
            multiple: {
              type: "boolean",
              description: "Allow selecting more than one option.",
            },
            custom: {
              type: "boolean",
              description:
                "Allow the user to type their own answer. Defaults to true.",
            },
          },
          required: ["question", "options"],
        },
      },
    },
    ["questions"],
  ),
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
    BROWSER_TOOL_NAME.manageTabs,
    "List, open, search, focus, close, group, or navigate browser tabs. Use this for tab lifecycle and tab organization instead of narrow tab tools.",
    {
      operation: {
        type: "string",
        enum: ["list", "open", "search", "focus", "close", "group", "navigate"],
        description: "Tab operation to perform. Defaults to list.",
      },
      url: {
        type: "string",
        description: "URL for operation=open or navigate with type=url.",
      },
      query: {
        type: "string",
        description: "Search query for operation=search.",
      },
      tabId: {
        type: "number",
        description:
          "Tab ID for focus, close, navigate, or active-tab fallback.",
      },
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "Tab IDs for close or group.",
      },
      type: {
        type: "string",
        enum: ["url", "back", "forward", "reload"],
        description: "Navigation type for operation=navigate.",
      },
      title: { type: "string", description: "Tab group title." },
      color: { type: "string", description: "Tab group color." },
      active: {
        type: "boolean",
        description: "Open the new tab active for operation=open.",
      },
      focus: {
        type: "boolean",
        description: "Focus the tab/window after open or navigate.",
      },
      waitUntil: {
        type: "string",
        enum: ["none", "load"],
        description: "Whether to wait for page load. Defaults to load.",
      },
      bypassCache: {
        type: "boolean",
        description: "Bypass cache for navigate reload.",
      },
      ...listSliceParameters,
      reason: {
        type: "string",
        description:
          "The reason for this tab operation. SHOULD use USER's language.",
      },
    },
    [],
  ),
  tool(BROWSER_TOOL_NAME.getCurrentTab, "Get current active tab", {}),
  tool(
    BROWSER_TOOL_NAME.mutatePage,
    "Modify the current page DOM, style, or scroll position. Use this for normal page actions and edits before CDP. Operations: click, input, setText, setHtml, insertHtml, insertElement, delete, setAttribute, removeAttribute, setInlineStyle, insertStyle, removeStyle, scroll. Prefer insertElement over insertHtml on strict dynamic pages.",
    {
      tabId: {
        type: "number",
        description: "The tab ID to modify. Defaults to active tab.",
      },
      operation: {
        type: "string",
        enum: [
          "click",
          "input",
          "setValue",
          "setText",
          "setHtml",
          "insertHtml",
          "insertElement",
          "delete",
          "setAttribute",
          "removeAttribute",
          "setInlineStyle",
          "insertStyle",
          "removeStyle",
          "scroll",
        ],
        description: "Mutation to perform.",
      },
      target: {
        type: "object",
        description:
          "Target element: { aiId/id, selector, text, selected }. selected=true uses the currently selected element. Not needed for insertStyle/removeStyle.",
      },
      value: {
        type: "string",
        description:
          "Text, HTML, attribute value, inline CSS declaration, fallback node text, or page CSS depending on operation.",
      },
      node: {
        type: "object",
        description:
          "Structured node for insertElement: { tag, text, attributes, style, children }. Creates DOM nodes without evaluating code or parsing HTML.",
      },
      operations: {
        type: "array",
        items: { type: "object" },
        description:
          "Optional small batch of mutation objects. Use for 2-10 similar safe edits; each item accepts the same fields as this tool.",
      },
      attribute: {
        type: "string",
        description: "Attribute name for setAttribute/removeAttribute.",
      },
      position: {
        type: "string",
        enum: ["beforebegin", "afterbegin", "beforeend", "afterend"],
        description:
          "Insertion position for insertHtml/insertElement. Defaults to beforeend.",
      },
      dedupeKey: {
        type: "string",
        description:
          "Optional idempotency key. insertElement adds data-oba-dedupe-key and skips when the target already contains the same key.",
      },
      skipIfExistsSelector: {
        type: "string",
        description:
          "Optional selector that skips the mutation if any matching element already exists.",
      },
      css: {
        type: "string",
        description: "Page CSS for insertStyle/removeStyle.",
      },
      openLinksInNewTab: {
        type: "boolean",
        description:
          "For click on links, open a background tab instead of navigating the current tab. Defaults true.",
      },
      direction: {
        type: "string",
        enum: ["top", "bottom", "pageUp", "pageDown"],
        description:
          "Scroll direction for operation=scroll. Defaults to bottom.",
      },
      x: {
        type: "number",
        description: "Window scroll x for operation=scroll.",
      },
      y: {
        type: "number",
        description: "Window scroll y for operation=scroll.",
      },
      behavior: {
        type: "string",
        enum: ["smooth", "instant"],
        description:
          "Scroll behavior for operation=scroll. Defaults to smooth.",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.inspectPage,
    "Inspect page text, translatable/content blocks, interactive elements, links, images, forms, and selected/target element context. Use this before CDP for normal DOM/page understanding, including DIV/card images without screenshots.",
    {
      tabId: {
        type: "number",
        description: "The tab ID to inspect. Defaults to active tab.",
      },
      tabIds: {
        type: "array",
        items: { type: "number" },
        description: "Optional multiple tab IDs to inspect.",
      },
      target: {
        type: "object",
        description:
          "Optional target element: { aiId/id, selector, text, selected }. selected=true uses the currently selected element.",
      },
      include: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "text",
            "blocks",
            "elements",
            "links",
            "images",
            "forms",
            "actions",
          ],
        },
        description:
          "Content to return. Defaults to text, elements, links, images, and forms. Use blocks for page-editing or bilingual insertion candidates.",
      },
      depthUp: {
        type: "number",
        description:
          "Ancestor levels to inspect around a target. Defaults to 6.",
      },
      depthDown: {
        type: "number",
        description:
          "Descendant levels to inspect around a target. Defaults to 4.",
      },
      siblingLimit: {
        type: "number",
        description: "Nearby sibling count around a target. Defaults to 3.",
      },
      itemOffset: listSliceParameters.offset,
      itemLimit: {
        ...listSliceParameters.limit,
        description:
          "Maximum items per returned list. Defaults to a compact 30; request more only when needed.",
      },
      textOffset: contentSliceParameters.offset,
      textLimit: {
        ...contentSliceParameters.limit,
        description:
          "Maximum characters of page text to return. Defaults to a compact 6000; request more only when needed.",
      },
      waitFor: {
        type: "object",
        description:
          "Optional wait condition before inspection: { text: string|string[], selector, timeout, pollMs }. Returns the inspected page after the condition is found.",
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
];

export const deferredDomainTools = [
  tool(
    BROWSER_TOOL_NAME.startSubAgent,
    "Delegate a focused task to another internal OpenBrowserAgent chat agent profile.",
    {
      agentId: { type: "string" },
      agentName: { type: "string" },
      task: { type: "string" },
      title: { type: "string" },
      background: { type: "boolean" },
      timeoutMs: { type: "number" },
    },
    ["task"],
  ),
  tool(
    BROWSER_TOOL_NAME.getSubAgentStatus,
    "Check or wait for a sub-agent task started by startSubAgent.",
    {
      taskId: { type: "string" },
      wait: { type: "boolean" },
      timeoutMs: { type: "number" },
    },
    ["taskId"],
  ),
  ...localExecutionBridgeTools,
  tool(
    BROWSER_TOOL_NAME.manageSkills,
    "List, create, read, read supporting files, update files, or patch available skill packages. For operation=list, no fields are required. For read, pass skillId and optionally offset/limit to page long skill text. For readFile/updateFile/patchFile, pass skillId and path.",
    {
      operation: {
        type: "string",
        enum: ["list", "create", "read", "readFile", "updateFile", "patchFile"],
        description: "Defaults to list.",
      },
      skillId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      instruction: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
      replacements: { type: "array", items: { type: "object" } },
      reason: { type: "string" },
      ...contentSliceParameters,
      ...listSliceParameters,
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.workspaceFiles,
    "List, read, write, patch, delete, or search private current-agent workspace files.",
    {
      operation: {
        type: "string",
        enum: ["list", "read", "write", "patch", "delete", "search"],
      },
      path: { type: "string" },
      content: { type: "string" },
      value: { type: "string" },
      find: { type: "string" },
      query: { type: "string" },
      ...contentSliceParameters,
      ...listSliceParameters,
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.manageMemory,
    "List, add, update, or remove long-term memory entries or user profile notes.",
    {
      operation: { type: "string", enum: ["list", "add", "update", "remove"] },
      scope: { type: "string", enum: ["memory", "user"] },
      id: { type: "string" },
      text: {
        type: "string",
        description: `Durable text, normalized to at most ${MEMORY_ENTRY_TEXT_MAX_CHARS} characters`,
      },
      ...listSliceParameters,
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.manageChatHistory,
    "Search, read, or delete saved chat history.",
    {
      operation: { type: "string", enum: ["search", "read", "delete"] },
      query: { type: "string" },
      chatId: { type: "string" },
      offset: { type: "number" },
      limit: { type: "number" },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.manageMcpServers,
    "List, add, update, test, or delete configured Streamable HTTP MCP servers.",
    {
      operation: {
        type: "string",
        enum: ["list", "add", "update", "test", "delete"],
      },
      serverId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      url: { type: "string" },
      enabled: { type: "boolean" },
      headers: { type: "object" },
    },
    [],
  ),
];

export const deferredBrowserTools = [...cdpTools, ...deferredDomainTools];

export const allBrowserTools = [...commonBrowserTools, ...deferredBrowserTools];
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
      isDeferredToolAvailable(tool.function.name, {
        capabilities,
        hasSkills,
        hasWorkspace,
        cdpToolsAvailable,
      }) &&
      loadedToolNames.includes(tool.function.name),
  );
  return [...browserTools, ...loadedTools].filter((item) => {
    const name = item.function.name;
    if (!capabilities.browserTools) return false;
    if (name === BROWSER_TOOL_NAME.loadTools)
      return capabilities.deferredBrowserTools;
    if (deferredBrowserTools.some((tool) => tool.function.name === name))
      return isDeferredToolAvailable(name, {
        capabilities,
        hasSkills,
        hasWorkspace,
        cdpToolsAvailable,
      });
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
    if (name === BROWSER_TOOL_NAME.generateImage)
      return capabilities.imageGeneration && imageGenerationEnabled;
    if (name === BROWSER_TOOL_NAME.getCurrentTime)
      return capabilities.currentTime;
    if (name === BROWSER_TOOL_NAME.question) return true;
    if (name === BROWSER_TOOL_NAME.readFileFromUrl)
      return capabilities.fileUrlRead || containsFileUrl(latestUserText || "");
    return capabilities.browserAutomation;
  });
}

function containsFileUrl(text: string) {
  return /https?:\/\/\S+|data:image\//i.test(text);
}

function isDeferredToolAvailable(
  name: string,
  context: {
    capabilities: AgentCapabilities;
    hasSkills: boolean;
    hasWorkspace: boolean;
    cdpToolsAvailable: boolean;
  },
) {
  const { capabilities, hasSkills, hasWorkspace, cdpToolsAvailable } = context;
  if (
    name === BROWSER_TOOL_NAME.startSubAgent ||
    name === BROWSER_TOOL_NAME.getSubAgentStatus
  )
    return capabilities.subAgents;
  if (
    name === BROWSER_TOOL_NAME.manageLocalExecutionBridges ||
    name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
    name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
    name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge
  )
    return capabilities.localExecutionBridges;
  if (name === BROWSER_TOOL_NAME.manageSkills)
    return capabilities.skillTools && (hasSkills || capabilities.skillCreation);
  if (name === BROWSER_TOOL_NAME.workspaceFiles)
    return (
      hasWorkspace &&
      (capabilities.workspaceRead || capabilities.workspaceWrite)
    );
  if (name === BROWSER_TOOL_NAME.manageMemory)
    return (
      hasWorkspace && (capabilities.memoryRead || capabilities.memoryWrite)
    );
  if (name === BROWSER_TOOL_NAME.manageChatHistory)
    return capabilities.chatHistoryRead || capabilities.chatHistoryWrite;
  if (name === BROWSER_TOOL_NAME.manageMcpServers)
    return capabilities.mcpManagement;
  if (name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript)
    return (
      capabilities.cdpTools &&
      capabilities.javascriptExecution &&
      cdpToolsAvailable
    );
  if (name.startsWith("cdp")) return capabilities.cdpTools && cdpToolsAvailable;
  return true;
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
