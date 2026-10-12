export const BROWSER_TOOL_NAME = {
  loadTools: "loadTools",
  read: "read",
  question: "question",
  wait: "wait",
  startSubAgent: "startSubAgent",
  getSubAgentStatus: "getSubAgentStatus",
  startLocalExecutionBridge: "startLocalExecutionBridge",
  getLocalExecutionBridgeStatus: "getLocalExecutionBridgeStatus",
  cancelLocalExecutionBridge: "cancelLocalExecutionBridge",
  manageLocalExecutionBridges: "manageLocalExecutionBridges",
  getCurrentTime: "getCurrentTime",
  manageTabs: "manageTabs",
  getCurrentTab: "getCurrentTab",
  mutatePage: "mutatePage",
  inspectPage: "inspectPage",
  captureVisibleTab: "captureVisibleTab",
  cdpInput: "cdpInput",
  cdpPage: "cdpPage",
  cdpExecuteArbitraryJavaScript: "cdpExecuteArbitraryJavaScript",
  cdpTakeScreenshot: "cdpTakeScreenshot",
  cdpDiagnostics: "cdpDiagnostics",
  downloadTabToMarkdown: "downloadTabToMarkdown",
  downloadAllImagesInTab: "downloadAllImagesInTab",
  readFileFromUrl: "readFileFromUrl",
  readUploadedAttachment: "readUploadedAttachment",
  manageSkills: "manageSkills",
  workspaceFiles: "workspaceFiles",
  manageMemory: "manageMemory",
  manageChatHistory: "manageChatHistory",
  manageMcpServers: "manageMcpServers",
  generateImage: "generateImage",
} as const;

export type BrowserToolName =
  (typeof BROWSER_TOOL_NAME)[keyof typeof BROWSER_TOOL_NAME];

export const UNKNOWN_TOOL_NAME = "unknown";
