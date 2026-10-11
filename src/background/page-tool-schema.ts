import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import {
  contentSliceParameters,
  listSliceParameters,
  tool,
} from "./tool-schema-helpers";

// Page inspection and mutation schemas; listed in commonBrowserTools.
export const mutatePageTool = tool(
  BROWSER_TOOL_NAME.mutatePage,
  "Modify the current page DOM, style, or scroll position. Use this for normal page actions and edits before CDP. Operations: click, input, setText, setHtml, insertHtml, insertElement, delete, setAttribute, removeAttribute, setInlineStyle, insertStyle, removeStyle, scroll. Clicks may include actionEvidence/postconditionRequired; verify resulting page state for user-visible actions. Prefer insertElement over insertHtml on strict dynamic pages.",
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
        "key",
      ],
      description: "Mutation to perform.",
    },
    target: {
      type: "object",
      description:
        "Target element: { aiId/id, selector, text, ariaLabel/label/title/placeholder, selected }. selected=true uses the currently selected element. Not needed for insertStyle/removeStyle.",
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
        "For click on links, open a background tab instead of navigating the current tab. Defaults false.",
    },
    direction: {
      type: "string",
      enum: ["top", "bottom", "pageUp", "pageDown"],
      description: "Scroll direction for operation=scroll. Defaults to bottom.",
    },
    x: {
      type: "number",
      description:
        "Viewport x coordinate for operation=click, or window scroll x for operation=scroll.",
    },
    y: {
      type: "number",
      description:
        "Viewport y coordinate for operation=click, or window scroll y for operation=scroll.",
    },
    behavior: {
      type: "string",
      enum: ["smooth", "instant"],
      description: "Scroll behavior for operation=scroll. Defaults to smooth.",
    },
    key: {
      type: "string",
      description: "KeyboardEvent key for operation=key. Defaults to Enter.",
    },
    code: {
      type: "string",
      description: "Optional KeyboardEvent code for operation=key.",
    },
    ctrlKey: { type: "boolean", description: "Hold Ctrl for operation=key." },
    shiftKey: {
      type: "boolean",
      description: "Hold Shift for operation=key.",
    },
    altKey: { type: "boolean", description: "Hold Alt for operation=key." },
    metaKey: { type: "boolean", description: "Hold Meta for operation=key." },
  },
  [],
);

export const inspectPageTool = tool(
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
        "Optional target element: { aiId/id, selector, text, ariaLabel/label/title/placeholder, selected }. selected=true uses the currently selected element.",
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
      description: "Ancestor levels to inspect around a target. Defaults to 6.",
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
);
