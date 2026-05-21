import {
  Bot,
  BookOpen,
  CircleHelp,
  Compass,
  FileText,
  Globe,
  Languages,
  Search,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_AGENT_ICON_ID,
  type AgentIconId,
} from "../shared/agent-icon-registry";
import type { Agent } from "../shared/types";

const AGENT_ICON_COMPONENTS: Record<AgentIconId, LucideIcon> = {
  bot: Bot,
  compass: Compass,
  search: Search,
  help: CircleHelp,
  languages: Languages,
  sparkles: Sparkles,
  globe: Globe,
  bookOpen: BookOpen,
  wrench: Wrench,
  fileText: FileText,
};

export function AgentIcon({
  agent,
  icon,
  size = 17,
  className,
}: {
  agent?: Agent;
  icon?: AgentIconId;
  size?: number;
  className?: string;
}) {
  const Icon =
    AGENT_ICON_COMPONENTS[icon || agent?.icon || DEFAULT_AGENT_ICON_ID] || Bot;
  return <Icon className={className} size={size} />;
}
