import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { areCdpToolsAvailable } from "../shared/runtime-capabilities";
import type { AgentCapabilities } from "../shared/types";
import { browserTools, deferredBrowserTools } from "./tool-schema";

export function browserToolsForPrompt({
  capabilities,
  hasSkills,
  hasWorkspace,
  imageGenerationEnabled,
  latestUserText,
  loadedToolNames = [],
  cdpToolsAvailable = areCdpToolsAvailable(),
}: {
  capabilities: AgentCapabilities;
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
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment) return true;
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
