import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { ATTACHMENT_TOOL_DESCRIPTION } from "../shared/attachments";
import { cdpTools } from "./cdp-tool-schema";
import { deferredDomainTools } from "./deferred-tool-schema";
import { inspectPageTool, mutatePageTool } from "./page-tool-schema";
import {
  contentSliceParameters,
  listSliceParameters,
  tool,
} from "./tool-schema-helpers";

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
        description:
          "Optional image size, such as 1024x1024. Values are normalized to gpt-image-2 constraints: multiples of 16, at least 655,360 total pixels, at most 8,294,400 total pixels, and no more than 3:1 aspect ratio.",
      },
      quality: { type: "string", description: "Optional quality setting" },
      count: { type: "number", description: "Optional image count" },
    },
    ["prompt"],
  ),
  tool(
    BROWSER_TOOL_NAME.manageTabs,
    "List, search existing tabs, open URLs, open web searches, focus, close, group, or navigate browser tabs. Use list/search before opening new tabs when the task may match an existing page.",
    {
      operation: {
        type: "string",
        enum: [
          "list",
          "search",
          "open",
          "webSearch",
          "focus",
          "close",
          "group",
          "navigate",
        ],
        description: "Tab operation to perform. Defaults to list.",
      },
      url: {
        type: "string",
        description: "URL for operation=open or navigate with type=url.",
      },
      query: {
        type: "string",
        description:
          "Query for operation=search to find existing tabs by title/URL, or operation=webSearch to open a web search page.",
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
  mutatePageTool,
  inspectPageTool,
  tool(
    BROWSER_TOOL_NAME.captureVisibleTab,
    "Capture the visible tab area",
    {
      tabId: {
        type: "number",
        description: "The tab ID to capture. Defaults to active tab.",
      },
      format: {
        type: "string",
        enum: ["png", "jpeg"],
        description:
          "Image format. Defaults to jpeg for efficient vision input.",
      },
      quality: {
        type: "number",
        description:
          "JPEG quality from 0 to 100. Defaults to an efficient low-quality screenshot.",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.downloadTabToMarkdown,
    "Download/export the tab as a Markdown file for the USER's device. This creates a user-facing file; it is not a way to pass page content to the agent. For page analysis or summarization, use inspectPage instead.",
    {
      tabId: {
        type: "number",
        description: "The ID of the tab to export to a user-downloadable file",
      },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.downloadAllImagesInTab,
    "Download/export tab images as a zip file for the USER's device. This creates a user-facing file; it is not a way to pass images to the agent. Not for visual inspection; use readFileFromUrl for that.",
    {
      tabId: {
        type: "number",
        description:
          "The ID of the tab whose images should be exported to a user-downloadable zip",
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

// Pages through stored outputs. Later sources (page text, files) extend the
// same handle + range contract.
export const readTool = tool(
  BROWSER_TOOL_NAME.read,
  'Read a stored output by handle, such as "art-1a2b3c4d" from a truncated, masked or unchanged tool result. Returns a character range; continue with the offset it reports.',
  {
    handle: {
      type: "string",
      description: "Handle of the stored output.",
    },
    ...contentSliceParameters,
  },
  ["handle"],
);

export const deferredBrowserTools = [...cdpTools, ...deferredDomainTools];

export const allBrowserTools = [
  ...commonBrowserTools,
  readTool,
  ...deferredBrowserTools,
];
export const browserTools = [
  ...commonBrowserTools,
  readTool,
  ...loaderBrowserTools,
];
