import { BROWSER_TOOL_NAME } from "../shared/browser-tools";

export const cdpTools = [
  tool(
    BROWSER_TOOL_NAME.cdpClickAt,
    "Click at viewport coordinates through CDP",
    {
      tabId: numberProperty("The tab ID"),
      x: numberProperty("Viewport x coordinate"),
      y: numberProperty("Viewport y coordinate"),
      dblClick: {
        type: "boolean",
        description: "Double click instead of single click",
      },
    },
    ["x", "y"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPressKey,
    "Press a key or key combination through CDP",
    {
      tabId: numberProperty("The tab ID"),
      key: stringProperty(
        "Key to press, such as Enter, Escape, Tab, or Control+A",
      ),
    },
    ["key"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpTypeText,
    "Type text into the currently focused element through CDP",
    {
      tabId: numberProperty("The tab ID"),
      text: stringProperty("Text to type"),
      submitKey: stringProperty("Optional key to press after typing"),
    },
    ["text"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpFill,
    "Fill an element by AI ID",
    {
      tabId: numberProperty("The tab ID"),
      id: stringProperty("AI ID of the element to fill"),
      value: stringProperty("Value to fill"),
    },
    ["id", "value"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpFillForm,
    "Fill multiple elements by AI ID",
    {
      tabId: numberProperty("The tab ID"),
      elements: {
        type: "array",
        items: { type: "object" },
        description: "Items with id and value",
      },
    },
    ["elements"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpDrag,
    "Drag between viewport coordinates through CDP",
    {
      tabId: numberProperty("The tab ID"),
      fromX: numberProperty("Start x"),
      fromY: numberProperty("Start y"),
      toX: numberProperty("End x"),
      toY: numberProperty("End y"),
    },
    ["fromX", "fromY", "toX", "toY"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpHandleDialog,
    "Handle a browser dialog if present",
    {
      tabId: numberProperty("The tab ID"),
      action: enumProperty(["accept", "dismiss"], "Dialog action"),
      promptText: stringProperty("Optional prompt text"),
    },
    ["action"],
  ),
  tool(BROWSER_TOOL_NAME.cdpListPages, "List open browser pages", {}),
  tool(
    BROWSER_TOOL_NAME.cdpNewPage,
    "Open a new browser page",
    {
      url: stringProperty("URL to open"),
      background: { type: "boolean", description: "Open in background" },
    },
    ["url"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpNavigatePage,
    "Navigate a page by URL, back, forward, or reload",
    {
      tabId: numberProperty("The tab ID"),
      type: enumProperty(
        ["url", "back", "forward", "reload"],
        "Navigation type",
      ),
      url: stringProperty("URL for type=url"),
      ignoreCache: { type: "boolean", description: "Bypass cache on reload" },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.cdpSelectPage,
    "Focus a page",
    {
      tabId: numberProperty("The tab ID"),
      bringToFront: { type: "boolean", description: "Focus the page window" },
    },
    ["tabId"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpClosePage,
    "Close a page",
    { tabId: numberProperty("The tab ID") },
    ["tabId"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpWaitFor,
    "Wait for text to appear on a page",
    {
      tabId: numberProperty("The tab ID"),
      text: {
        type: "array",
        items: { type: "string" },
        description: "Texts to wait for",
      },
      timeout: numberProperty("Timeout in milliseconds"),
    },
    ["text"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpResizePage,
    "Resize the page window",
    {
      tabId: numberProperty("The tab ID"),
      width: numberProperty("Window width"),
      height: numberProperty("Window height"),
    },
    ["width", "height"],
  ),
  tool(BROWSER_TOOL_NAME.cdpEmulate, "Apply CDP emulation settings", {
    tabId: numberProperty("The tab ID"),
    viewport: stringProperty("Viewport WxHxDPR[,mobile]"),
    userAgent: stringProperty("User agent override"),
    colorScheme: enumProperty(["dark", "light", "auto"], "Color scheme"),
  }),
  tool(
    BROWSER_TOOL_NAME.cdpEvaluateScript,
    "Evaluate a JavaScript function in the page through CDP",
    {
      tabId: numberProperty("The tab ID"),
      function: stringProperty("Function declaration to execute"),
      expression: stringProperty("Expression fallback"),
    },
    ["function"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpTakeScreenshot,
    "Capture a page screenshot through CDP",
    {
      tabId: numberProperty("The tab ID"),
      format: enumProperty(["png", "jpeg", "webp"], "Image format"),
      fullPage: {
        type: "boolean",
        description: "Capture full page if supported",
      },
    },
  ),
  tool(BROWSER_TOOL_NAME.cdpTakeSnapshot, "Take a text snapshot of the page", {
    tabId: numberProperty("The tab ID"),
    verbose: { type: "boolean", description: "Include more detail" },
  }),
  tool(
    BROWSER_TOOL_NAME.cdpListConsoleMessages,
    "List console messages collected through CDP",
    { tabId: numberProperty("The tab ID") },
  ),
  tool(
    BROWSER_TOOL_NAME.cdpGetConsoleMessage,
    "Get one console message by ID",
    {
      tabId: numberProperty("The tab ID"),
      msgid: numberProperty("Message ID"),
    },
    ["msgid"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpListNetworkRequests,
    "List network/resource requests for a page",
    {
      tabId: numberProperty("The tab ID"),
      pageIdx: numberProperty("Page index"),
      pageSize: numberProperty("Page size"),
    },
  ),
  tool(
    BROWSER_TOOL_NAME.cdpGetNetworkRequest,
    "Get one network request by ID",
    {
      tabId: numberProperty("The tab ID"),
      reqid: numberProperty("Request ID"),
    },
    ["reqid"],
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPerformanceStartTrace,
    "Start a CDP performance trace",
    {
      tabId: numberProperty("The tab ID"),
      reload: { type: "boolean", description: "Reload after starting" },
      autoStop: { type: "boolean", description: "Auto-stop trace" },
    },
  ),
  tool(
    BROWSER_TOOL_NAME.cdpPerformanceStopTrace,
    "Stop a CDP performance trace",
    { tabId: numberProperty("The tab ID") },
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
  tool(BROWSER_TOOL_NAME.cdpTakeMemorySnapshot, "Take a memory heap snapshot", {
    tabId: numberProperty("The tab ID"),
    filePath: stringProperty("Output file path"),
  }),
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

function numberProperty(description: string) {
  return { type: "number", description };
}

function enumProperty(values: string[], description: string) {
  return { type: "string", enum: values, description };
}
