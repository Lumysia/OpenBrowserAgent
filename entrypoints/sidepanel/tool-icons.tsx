import {
  Clock,
  Bot,
  Camera,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Image as ImageIcon,
  Keyboard,
  Layers,
  List,
  MousePointerClick,
  MessageCircleQuestion,
  Network,
  PenLine,
  PanelTop,
  Plug,
  RefreshCw,
  Search,
  ServerCog,
  Trash2,
  TerminalSquare,
  Type,
  Video,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";

export function toolIcon(name: string, input: Record<string, unknown> = {}) {
  const lowerName = name.toLowerCase();
  const operation = stringValue(input.operation || input.type || input.action);
  if (name === BROWSER_TOOL_NAME.loadTools)
    return operation === "list" ? icon(List) : icon(Layers);
  if (name === BROWSER_TOOL_NAME.question) return icon(MessageCircleQuestion);
  if (name === BROWSER_TOOL_NAME.startSubAgent) return icon(Bot);
  if (name === BROWSER_TOOL_NAME.getSubAgentStatus) return icon(FileSearch);
  if (name === BROWSER_TOOL_NAME.manageTabs) return manageTabsIcon(operation);
  if (name === BROWSER_TOOL_NAME.mutatePage) return mutatePageIcon(operation);
  if (name === BROWSER_TOOL_NAME.inspectPage) return icon(FileSearch);
  if (name === BROWSER_TOOL_NAME.captureVisibleTab) return icon(Camera);
  if (
    name === BROWSER_TOOL_NAME.manageLocalExecutionBridges ||
    name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
    name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
    name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge
  ) {
    if (name === BROWSER_TOOL_NAME.manageLocalExecutionBridges)
      return manageBridgeIcon(operation);
    return icon(TerminalSquare);
  }
  if (isWorkspaceToolName(name)) {
    if (operation === "list") return icon(FolderOpen);
    if (operation === "search") return icon(FileSearch);
    if (operation === "write" || operation === "patch") return icon(PenLine);
    if (operation === "delete") return icon(Trash2);
    return icon(FileText);
  }
  if (isMemoryToolName(name)) return icon(Database);
  if (isSessionToolName(name)) return icon(History);
  if (name === BROWSER_TOOL_NAME.manageMcpServers) return icon(ServerCog);
  if (lowerName.includes("mcp")) return icon(Plug);
  if (name === BROWSER_TOOL_NAME.cdpInput) return cdpInputIcon(operation);
  if (name === BROWSER_TOOL_NAME.cdpPage) return cdpPageIcon(operation);
  if (name === BROWSER_TOOL_NAME.cdpDiagnostics) return icon(Network);
  if (lowerName.includes("input") || lowerName.includes("fill"))
    return icon(Type);
  if (lowerName.includes("presskey")) return icon(Keyboard);
  if (lowerName.includes("click") || lowerName.includes("mouse"))
    return icon(MousePointerClick);
  if (lowerName.includes("drag")) return icon(MousePointerClick);
  if (lowerName.includes("find") || lowerName.includes("search"))
    return icon(Search);
  if (lowerName.includes("download")) return icon(Download);
  if (lowerName.includes("time") || lowerName.includes("wait"))
    return icon(Clock);
  if (lowerName.includes("lighthouse")) return icon(Gauge);
  if (lowerName.includes("network")) return icon(Network);
  if (lowerName.includes("memory") || lowerName.includes("nodesbyclass"))
    return icon(Database);
  if (lowerName.includes("screencast")) return icon(Video);
  if (lowerName.includes("dialog") || lowerName.includes("emulate"))
    return icon(PanelTop);
  if (lowerName.includes("performance") || lowerName.includes("trace"))
    return icon(Gauge);
  if (lowerName.includes("screenshot") || lowerName.includes("snapshot"))
    return lowerName.includes("memory") ? icon(Database) : icon(Camera);
  if (lowerName.includes("script") || lowerName.includes("console"))
    return icon(Code2);
  if (name === BROWSER_TOOL_NAME.generateImage) return icon(ImageIcon);
  if (
    name === BROWSER_TOOL_NAME.readUploadedAttachment ||
    name === BROWSER_TOOL_NAME.readFileFromUrl
  )
    return icon(FileSearch);
  if (name === BROWSER_TOOL_NAME.manageSkills)
    return operation === "list" ? icon(List) : icon(FileText);
  if (lowerName.includes("element") || lowerName.includes("properties"))
    return icon(FileSearch);
  if (lowerName.includes("scroll")) return icon(PanelTop);
  if (lowerName.includes("content")) return icon(FileText);
  if (lowerName.includes("group")) return icon(Layers);
  if (lowerName.includes("tab") || lowerName.includes("page"))
    return icon(ExternalLink);
  return icon(Wrench);
}

function manageTabsIcon(operation: string) {
  if (operation === "list") return icon(List);
  if (operation === "open" || operation === "focus") return icon(ExternalLink);
  if (operation === "search") return icon(Search);
  if (operation === "close") return icon(Trash2);
  if (operation === "group") return icon(Layers);
  if (operation === "navigate") return icon(RefreshCw);
  return icon(ExternalLink);
}

function mutatePageIcon(operation: string) {
  if (operation === "click") return icon(MousePointerClick);
  if (operation === "input") return icon(Type);
  if (operation === "scroll") return icon(PanelTop);
  if (operation === "delete") return icon(Trash2);
  return icon(PenLine);
}

function manageBridgeIcon(operation: string) {
  if (operation === "list" || operation === "status") return icon(List);
  if (operation === "test") return icon(Wrench);
  if (operation === "delete") return icon(Trash2);
  return icon(TerminalSquare);
}

function cdpInputIcon(operation: string) {
  if (operation === "key" || operation === "type" || operation === "fill")
    return icon(Keyboard);
  if (operation === "dialog") return icon(MessageCircleQuestion);
  return icon(MousePointerClick);
}

function cdpPageIcon(operation: string) {
  if (operation === "list") return icon(List);
  if (operation === "waitFor") return icon(Clock);
  if (operation === "resize" || operation === "emulate") return icon(PanelTop);
  if (operation === "snapshot") return icon(FileSearch);
  return icon(ExternalLink);
}

function icon(Icon: ComponentType<{ size?: number; strokeWidth?: number }>) {
  return <Icon size={19} strokeWidth={2.1} />;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isWorkspaceToolName(name: string) {
  return name === BROWSER_TOOL_NAME.workspaceFiles;
}

export function isMemoryToolName(name: string) {
  return name === BROWSER_TOOL_NAME.manageMemory;
}

export function isSessionToolName(name: string) {
  return name === BROWSER_TOOL_NAME.manageChatHistory;
}
