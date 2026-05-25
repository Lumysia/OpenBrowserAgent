import { BROWSER_TOOL_NAME } from "../shared/browser-tools";

const contentSliceParameters = {
  offset: numberProperty("Zero-based character offset for returned content"),
  limit: numberProperty("Maximum characters to return for this read"),
} as const;

const listSliceParameters = {
  offset: numberProperty("Zero-based item offset for returned results"),
  limit: numberProperty("Maximum items to return"),
} as const;

export const cdpTools = [
  tool(
    BROWSER_TOOL_NAME.cdpInput,
    "Fallback CDP input actions when mutatePage/normal DOM events are insufficient. Handles mouse, keyboard, typing, filling, drag, and dialogs in one tool.",
    {
      operation: enumProperty(
        [
          "click",
          "hover",
          "doubleClick",
          "key",
          "type",
          "fill",
          "fillForm",
          "drag",
          "dialog",
        ],
        "Input operation to perform",
      ),
      id: stringProperty("AI ID of the element to target for AI-ID operations"),
      tabId: numberProperty("The tab ID containing the element"),
      targetId: targetIdProperty(),
      x: numberProperty("Viewport x coordinate"),
      y: numberProperty("Viewport y coordinate"),
      key: stringProperty(
        "Key to press, such as Enter, Escape, Tab, or Control+A",
      ),
      text: stringProperty("Text to type"),
      submitKey: stringProperty("Optional key to press after typing"),
      value: stringProperty("Value to fill"),
      elements: {
        type: "array",
        items: { type: "object" },
        description: "Form items with id and value for operation=fillForm",
      },
      fromX: numberProperty("Start x"),
      fromY: numberProperty("Start y"),
      toX: numberProperty("End x"),
      toY: numberProperty("End y"),
      action: enumProperty(["accept", "dismiss"], "Dialog action"),
      promptText: stringProperty("Optional prompt text"),
    },
    ["operation"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPage,
    "Fallback CDP page management and page-level emulation. Use only when common tab/page tools are insufficient.",
    {
      operation: enumProperty(
        [
          "list",
          "new",
          "navigate",
          "focus",
          "close",
          "waitFor",
          "resize",
          "emulate",
          "snapshot",
        ],
        "Page operation to perform",
      ),
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
      url: stringProperty("URL to open"),
      background: { type: "boolean", description: "Open in background" },
      type: enumProperty(
        ["url", "back", "forward", "reload"],
        "Navigation type",
      ),
      ignoreCache: { type: "boolean", description: "Bypass cache on reload" },
      bringToFront: { type: "boolean", description: "Focus the page window" },
      text: {
        type: "array",
        items: { type: "string" },
        description: "Texts to wait for",
      },
      timeout: numberProperty("Timeout in milliseconds"),
      width: numberProperty("Window width"),
      height: numberProperty("Window height"),
      viewport: stringProperty("Viewport WxHxDPR[,mobile]"),
      userAgent: stringProperty("User agent override"),
      colorScheme: enumProperty(["dark", "light", "auto"], "Color scheme"),
      ...listSliceParameters,
      ...contentSliceParameters,
    },
    ["operation"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpEvaluateScript,
    "Evaluate a JavaScript function in the page through CDP",
    {
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
      function: stringProperty("Function declaration to execute"),
      expression: stringProperty("Expression fallback"),
      ...contentSliceParameters,
    },
    ["function"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript,
    "DANGEROUS: Execute arbitrary JavaScript in any scriptable tab without extension-side safety limits. Only available when the dangerous code execution setting is enabled.",
    {
      tabId: numberProperty("The tab ID. Defaults to the active tab."),
      targetId: targetIdProperty(),
      code: stringProperty(
        "Arbitrary JavaScript source to evaluate in the target tab. Return a JSON-serializable value when possible.",
      ),
      world: enumProperty(
        ["MAIN", "ISOLATED"],
        "Execution world. MAIN can affect page scripts; ISOLATED runs in the extension isolated world.",
      ),
      ...contentSliceParameters,
    },
    ["code"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpTakeScreenshot,
    "Capture a page screenshot through CDP",
    {
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
      format: enumProperty(["png", "jpeg", "webp"], "Image format"),
      quality: numberProperty(
        "JPEG/WebP quality from 0 to 100. Defaults to an efficient low-quality screenshot.",
      ),
      fullPage: {
        type: "boolean",
        description: "Capture full page if supported",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpDiagnostics,
    "Read lightweight CDP diagnostics. Current network/resources mode returns PerformanceResourceTiming entries, not persisted request bodies.",
    {
      operation: enumProperty(
        ["resources", "network", "console"],
        "Diagnostics operation. resources/network returns performance resource entries; console starts collection and returns currently buffered extension-side messages when available.",
      ),
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
      ...listSliceParameters,
    },
    ["operation"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPerformanceStartTrace,
    "Start a CDP performance trace",
    {
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
      reload: { type: "boolean", description: "Reload after starting" },
      autoStop: { type: "boolean", description: "Auto-stop trace" },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPerformanceStopTrace,
    "Stop a CDP performance trace",
    {
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPerformanceAnalyzeInsight,
    "Analyze a performance insight from a trace",
    {
      insightName: stringProperty("Insight name"),
      insightSetId: stringProperty("Insight set ID"),
    },
    ["insightName", "insightSetId"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpTakeMemorySnapshot,
    "Take a memory heap snapshot",
    {
      tabId: numberProperty("The tab ID"),
      targetId: targetIdProperty(),
      filePath: stringProperty("Output file path"),
    },
    ["filePath"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpGetMemorySnapshotDetails,
    "Get memory snapshot details",
    {
      filePath: stringProperty("Heap snapshot path"),
      pageIdx: numberProperty("Page index"),
      pageSize: numberProperty("Page size"),
    },
    ["filePath"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpGetNodesByClass,
    "Get memory nodes by class",
    {
      filePath: stringProperty("Heap snapshot path"),
      uid: numberProperty("Class UID"),
      pageIdx: numberProperty("Page index"),
      pageSize: numberProperty("Page size"),
    },
    ["filePath", "uid"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpLoadMemorySnapshot,
    "Load a memory heap snapshot",
    { filePath: stringProperty("Heap snapshot path") },
    ["filePath"],
  ),
  tool(BROWSER_TOOL_NAME.cdpLighthouseAudit, "Run a Lighthouse-style audit", {
    tabId: numberProperty("The tab ID"),
    device: enumProperty(["desktop", "mobile"], "Device"),
    mode: enumProperty(["navigation", "snapshot"], "Audit mode"),
  }),
  tool(BROWSER_TOOL_NAME.cdpScreencastStart, "Start page screencast capture", {
    tabId: numberProperty("The tab ID"),
    filePath: stringProperty("Output path"),
  }),
  tool(BROWSER_TOOL_NAME.cdpScreencastStop, "Stop page screencast capture", {
    tabId: numberProperty("The tab ID"),
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
      parameters: { type: "object", properties, required },
    },
  };
}

function stringProperty(description: string) {
  return { type: "string", description };
}

function targetIdProperty() {
  return stringProperty("The CDP target ID when tab APIs are unavailable");
}

function numberProperty(description: string) {
  return { type: "number", description };
}

function enumProperty(values: string[], description: string) {
  return { type: "string", enum: values, description };
}
