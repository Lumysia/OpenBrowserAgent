import type { ComponentType } from "react";
import {
  Bot,
  Bug,
  Cloud,
  FileText,
  Highlighter,
  Languages,
  MousePointerClick,
  Plug,
  Server,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { OPTIONS_HASH, OPTIONS_ROUTE } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { AgentsPage } from "./agents-page";
import { ContextMenuPage } from "./context-menu-page";
import { DebugPage } from "./debug-page";
import { GeneralPage } from "./general-page";
import { LocalExecutionBridgesPage } from "./local-execution-bridges-page";
import { McpPage } from "./mcp-page";
import { PageTranslatePage } from "./page-translate-page";
import { ProvidersPage } from "./providers-page";
import { SkillsPage } from "./skills-page";
import { SmartBarPage } from "./smart-bar-page";
import { SyncPage } from "./sync-page";
import { WelcomePage } from "./welcome-page";

type OptionsPageId = keyof typeof OPTIONS_ROUTE;

type OptionsPage = {
  id: OptionsPageId;
  route: string;
  hash: string;
  icon: LucideIcon;
  title: (t: Messages) => string;
  Page: ComponentType;
  // Reached by link only, not listed in the sidebar.
  hidden?: boolean;
};

const PAGES: Record<
  OptionsPageId,
  Pick<OptionsPage, "icon" | "title" | "Page" | "hidden">
> = {
  general: {
    icon: SlidersHorizontal,
    title: (t) => t.options.general,
    Page: GeneralPage,
  },
  agents: { icon: Bot, title: (t) => t.options.agents, Page: AgentsPage },
  sync: { icon: Cloud, title: (t) => t.options.sync, Page: SyncPage },
  providers: {
    icon: Server,
    title: (t) => t.options.providers,
    Page: ProvidersPage,
  },
  mcp: { icon: Plug, title: (t) => t.options.mcpServers, Page: McpPage },
  localExecutionBridges: {
    icon: TerminalSquare,
    title: (t) => t.options.localExecutionBridges,
    Page: LocalExecutionBridgesPage,
  },
  skills: { icon: FileText, title: (t) => t.options.skills, Page: SkillsPage },
  smartBar: {
    icon: Highlighter,
    title: (t) => t.smartBar.settingsTitle,
    Page: SmartBarPage,
  },
  contextMenu: {
    icon: MousePointerClick,
    title: (t) => t.contextMenu.settingsTitle,
    Page: ContextMenuPage,
  },
  pageTranslate: {
    icon: Languages,
    title: (t) => t.pageTranslate.settingsTitle,
    Page: PageTranslatePage,
  },
  debug: { icon: Bug, title: (t) => t.options.debug, Page: DebugPage },
  welcome: {
    icon: Sparkles,
    title: (t) => t.setup.welcomeTitle,
    Page: WelcomePage,
    hidden: true,
  },
};

// The settings pages, in OPTIONS_ROUTE's order (the sidebar's). The first
// one is shown for an unknown route.
export const OPTIONS_PAGES: OptionsPage[] = (
  Object.keys(OPTIONS_ROUTE) as OptionsPageId[]
).map((id) => ({
  id,
  route: OPTIONS_ROUTE[id],
  hash: OPTIONS_HASH[id],
  ...PAGES[id],
}));

export function optionsPageFor(route: string) {
  return OPTIONS_PAGES.find((page) => page.route === route) ?? OPTIONS_PAGES[0];
}
