import {
  Bot,
  Braces,
  CalendarClock,
  Camera,
  Code2,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Flag,
  FolderOpen,
  Gauge,
  History,
  Image as ImageIcon,
  Layers,
  List,
  MessageCircleQuestion,
  MousePointerClick,
  PenLine,
  Plug,
  ScanText,
  Search,
  ServerCog,
  Sparkles,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { isMcpToolName, TOOL_NAME } from "../../src/shared/tool-names";

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

const ICONS: Record<string, Icon> = {
  [TOOL_NAME.snapshot]: ScanText,
  [TOOL_NAME.find]: Search,
  [TOOL_NAME.read]: FileSearch,
  [TOOL_NAME.extract]: Sparkles,
  [TOOL_NAME.act]: MousePointerClick,
  [TOOL_NAME.editPage]: PenLine,
  [TOOL_NAME.webSearch]: Search,
  [TOOL_NAME.screenshot]: Camera,
  [TOOL_NAME.ask]: MessageCircleQuestion,
  [TOOL_NAME.toolSearch]: Layers,
  [TOOL_NAME.downloads]: Download,
  [TOOL_NAME.skills]: FileText,
  [TOOL_NAME.workspace]: FolderOpen,
  [TOOL_NAME.chatHistory]: History,
  [TOOL_NAME.subAgent]: Bot,
  [TOOL_NAME.mcpServers]: ServerCog,
  [TOOL_NAME.localCommand]: TerminalSquare,
  [TOOL_NAME.localBridges]: TerminalSquare,
  [TOOL_NAME.generateImage]: ImageIcon,
  [TOOL_NAME.runScript]: Code2,
  [TOOL_NAME.runCode]: Braces,
  [TOOL_NAME.devtools]: Gauge,
  [TOOL_NAME.tasks]: CalendarClock,
  [TOOL_NAME.taskResult]: Flag,
};

export function toolIcon(name: string, input: Record<string, unknown> = {}) {
  const Icon =
    name === TOOL_NAME.tabs
      ? input.action === "list"
        ? List
        : ExternalLink
      : ICONS[name] || (isMcpToolName(name) ? Plug : Wrench);
  return <Icon size={19} strokeWidth={2.1} />;
}
