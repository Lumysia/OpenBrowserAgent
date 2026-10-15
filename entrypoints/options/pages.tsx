import type { ComponentType } from "react";
import {
  Cloud,
  MousePointerClick,
  Server,
  SlidersHorizontal,
  Sparkles,
  Bot,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { OPTIONS_PAGE_ROUTE, OPTIONS_ROUTE } from "../../src/shared/config";
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
import { tabbedPage } from "./tabbed-page";
import { SetupWizard } from "./setup-wizard";

type OptionsPageId = keyof typeof OPTIONS_PAGE_ROUTE;

type OptionsPage = {
  id: OptionsPageId;
  route: string;
  icon: LucideIcon;
  title: (t: Messages) => string;
  Page: ComponentType<{ route: string }>;
  // A page of its own, without the sidebar, reached by link only.
  standalone?: boolean;
};

const PAGES: Record<
  OptionsPageId,
  Pick<OptionsPage, "icon" | "title" | "Page" | "standalone">
> = {
  general: {
    icon: SlidersHorizontal,
    title: (t) => t.options.general,
    Page: GeneralPage,
  },
  providers: {
    icon: Server,
    title: (t) => t.settings.providersModels,
    Page: ProvidersPage,
  },
  agents: {
    icon: Bot,
    title: (t) => t.settings.agentsSkills,
    Page: tabbedPage([
      {
        route: OPTIONS_ROUTE.agents,
        title: (t) => t.options.agents,
        Page: AgentsPage,
      },
      {
        route: OPTIONS_ROUTE.skills,
        title: (t) => t.options.skills,
        Page: SkillsPage,
      },
    ]),
  },
  onPages: {
    icon: MousePointerClick,
    title: (t) => t.settings.onPages,
    Page: tabbedPage([
      {
        route: OPTIONS_ROUTE.pageTranslate,
        title: (t) => t.settings.translate,
        Page: PageTranslatePage,
      },
      {
        route: OPTIONS_ROUTE.smartBar,
        title: (t) => t.smartBar.settingsTitle,
        Page: SmartBarPage,
      },
      {
        route: OPTIONS_ROUTE.contextMenu,
        title: (t) => t.settings.rightClick,
        Page: ContextMenuPage,
      },
    ]),
  },
  sync: { icon: Cloud, title: (t) => t.options.sync, Page: SyncPage },
  advanced: {
    icon: Wrench,
    title: (t) => t.settings.advanced,
    Page: tabbedPage([
      {
        route: OPTIONS_ROUTE.mcp,
        title: (t) => t.options.mcpServers,
        Page: McpPage,
      },
      {
        route: OPTIONS_ROUTE.localExecutionBridges,
        title: (t) => t.options.localExecutionBridges,
        Page: LocalExecutionBridgesPage,
      },
      {
        route: OPTIONS_ROUTE.debug,
        title: (t) => t.settings.troubleshooting,
        Page: DebugPage,
      },
    ]),
  },
  welcome: {
    icon: Sparkles,
    title: (t) => t.setup.welcomeTitle,
    Page: SetupWizard,
    standalone: true,
  },
};

// The settings pages, in OPTIONS_PAGE_ROUTE's order (the sidebar's). The
// first one is shown for an unknown route.
export const OPTIONS_PAGES: OptionsPage[] = (
  Object.keys(OPTIONS_PAGE_ROUTE) as OptionsPageId[]
).map((id) => ({ id, route: OPTIONS_PAGE_ROUTE[id], ...PAGES[id] }));

// The page a route is on: its own, or the page of a tab inside it
// ("/advanced/mcp" is on "/advanced").
export function optionsPageFor(route: string) {
  const page = `/${route.split("/")[1] ?? ""}`;
  return OPTIONS_PAGES.find((item) => item.route === page) ?? OPTIONS_PAGES[0];
}
