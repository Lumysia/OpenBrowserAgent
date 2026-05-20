import {
  Clock,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Gauge,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
  Network,
  PanelTop,
  Plug,
  Search,
  Square,
  TerminalSquare,
  Type,
} from "lucide-react";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";

export function toolIcon(name: string) {
  const lowerName = name.toLowerCase();
  if (name === BROWSER_TOOL_NAME.loadBrowserTools)
    return <Layers size={19} strokeWidth={2.1} />;
  if (isWorkspaceToolName(name)) {
    if (name === BROWSER_TOOL_NAME.searchWorkspaceFiles)
      return <FileSearch size={19} strokeWidth={2.1} />;
    return <FileText size={19} strokeWidth={2.1} />;
  }
  if (isMemoryToolName(name)) return <FileText size={19} strokeWidth={2.1} />;
  if (isSessionToolName(name))
    return <FileSearch size={19} strokeWidth={2.1} />;
  if (lowerName.includes("mcp")) return <Plug size={19} strokeWidth={2.1} />;
  if (lowerName.includes("input") || lowerName.includes("fill"))
    return <Type size={19} strokeWidth={2.1} />;
  if (lowerName.includes("presskey"))
    return <Type size={19} strokeWidth={2.1} />;
  if (lowerName.includes("click") || lowerName.includes("mouse"))
    return <MousePointerClick size={19} strokeWidth={2.1} />;
  if (lowerName.includes("drag"))
    return <MousePointerClick size={19} strokeWidth={2.1} />;
  if (lowerName.includes("find") || lowerName.includes("search"))
    return <Search size={19} strokeWidth={2.1} />;
  if (lowerName.includes("download"))
    return <Download size={19} strokeWidth={2.1} />;
  if (lowerName.includes("time") || lowerName.includes("wait"))
    return <Clock size={19} strokeWidth={2.1} />;
  if (lowerName.includes("lighthouse"))
    return <Gauge size={19} strokeWidth={2.1} />;
  if (lowerName.includes("network"))
    return <Network size={19} strokeWidth={2.1} />;
  if (lowerName.includes("memory") || lowerName.includes("nodesbyclass"))
    return <FileSearch size={19} strokeWidth={2.1} />;
  if (lowerName.includes("screencast"))
    return <PanelTop size={19} strokeWidth={2.1} />;
  if (lowerName.includes("dialog") || lowerName.includes("emulate"))
    return <PanelTop size={19} strokeWidth={2.1} />;
  if (lowerName.includes("performance") || lowerName.includes("trace"))
    return <Gauge size={19} strokeWidth={2.1} />;
  if (lowerName.includes("screenshot") || lowerName.includes("snapshot"))
    return <PanelTop size={19} strokeWidth={2.1} />;
  if (lowerName.includes("script") || lowerName.includes("console"))
    return <TerminalSquare size={19} strokeWidth={2.1} />;
  if (name === BROWSER_TOOL_NAME.generateImage)
    return <ImageIcon size={19} strokeWidth={2.1} />;
  if (
    name === BROWSER_TOOL_NAME.readUploadedAttachment ||
    name === BROWSER_TOOL_NAME.readFileFromUrl
  )
    return <FileSearch size={19} strokeWidth={2.1} />;
  if (
    name === BROWSER_TOOL_NAME.listSkills ||
    name === BROWSER_TOOL_NAME.createSkill ||
    name === BROWSER_TOOL_NAME.readSkill ||
    name === BROWSER_TOOL_NAME.readSkillFile ||
    name === BROWSER_TOOL_NAME.updateSkillFile ||
    name === BROWSER_TOOL_NAME.patchSkillFile
  )
    return <FileText size={19} strokeWidth={2.1} />;
  if (lowerName.includes("element") || lowerName.includes("properties"))
    return <FileSearch size={19} strokeWidth={2.1} />;
  if (lowerName.includes("scroll"))
    return <PanelTop size={19} strokeWidth={2.1} />;
  if (lowerName.includes("content"))
    return <FileText size={19} strokeWidth={2.1} />;
  if (lowerName.includes("group"))
    return <Layers size={19} strokeWidth={2.1} />;
  if (lowerName.includes("tab") || lowerName.includes("page"))
    return <ExternalLink size={19} strokeWidth={2.1} />;
  return <Square size={15} strokeWidth={2.1} />;
}

function isWorkspaceToolName(name: string) {
  return (
    name === BROWSER_TOOL_NAME.listWorkspaceFiles ||
    name === BROWSER_TOOL_NAME.readWorkspaceFile ||
    name === BROWSER_TOOL_NAME.writeWorkspaceFile ||
    name === BROWSER_TOOL_NAME.patchWorkspaceFile ||
    name === BROWSER_TOOL_NAME.deleteWorkspaceFile ||
    name === BROWSER_TOOL_NAME.searchWorkspaceFiles
  );
}

export function isMemoryToolName(name: string) {
  return (
    name === BROWSER_TOOL_NAME.listMemory ||
    name === BROWSER_TOOL_NAME.addMemory ||
    name === BROWSER_TOOL_NAME.updateMemory ||
    name === BROWSER_TOOL_NAME.removeMemory ||
    name === BROWSER_TOOL_NAME.listUserProfile ||
    name === BROWSER_TOOL_NAME.addUserProfileNote ||
    name === BROWSER_TOOL_NAME.updateUserProfileNote ||
    name === BROWSER_TOOL_NAME.removeUserProfileNote
  );
}

export function isSessionToolName(name: string) {
  return (
    name === BROWSER_TOOL_NAME.searchChatHistory ||
    name === BROWSER_TOOL_NAME.readChatThread ||
    name === BROWSER_TOOL_NAME.deleteChatThread
  );
}
