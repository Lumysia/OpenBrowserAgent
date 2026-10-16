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
import { SetupWizard } from "./setup-wizard";

type OptionsPageId = keyof typeof OPTIONS_PAGE_ROUTE;

// One page of settings, with its own heading.
export type OptionsSubPage = {
  route: string;
  title: (t: Messages) => string;
  Page: ComponentType;
};

// A sidebar entry: a page, or a group of sub-pages listed under it (the
// first one is the group's own route's page).
type OptionsPage = {
  id: OptionsPageId;
  route: string;
  icon: LucideIcon;
  title: (t: Messages) => string;
  subPages: OptionsSubPage[];
  // A page of its own, without the sidebar, reached by link only.
  standalone?: boolean;
};

type PageEntry = Pick<OptionsPage, "icon" | "title" | "standalone"> &
  ({ Page: ComponentType } | { subPages: OptionsSubPage[] });

const PAGES: Record<OptionsPageId, PageEntry> = {
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
    subPages: [
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
    ],
  },
  onPages: {
    icon: MousePointerClick,
    title: (t) => t.settings.onPages,
    subPages: [
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
    ],
  },
  sync: { icon: Cloud, title: (t) => t.options.sync, Page: SyncPage },
  advanced: {
    icon: Wrench,
    title: (t) => t.settings.advanced,
    subPages: [
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
    ],
  },
  welcome: {
    icon: Sparkles,
    title: (t) => t.setup.welcomeTitle,
    Page: SetupWizard,
    standalone: true,
  },
};

// The settings pages, in OPTIONS_PAGE_ROUTE's order (the sidebar's). The
// first one is shown for an unknown route. A page without sub-pages is its
// own single sub-page.
export const OPTIONS_PAGES: OptionsPage[] = (
  Object.keys(OPTIONS_PAGE_ROUTE) as OptionsPageId[]
).map((id) => {
  const { icon, title, standalone, ...entry } = PAGES[id];
  const route = OPTIONS_PAGE_ROUTE[id];
  return {
    id,
    route,
    icon,
    title,
    standalone,
    subPages:
      "subPages" in entry
        ? entry.subPages
        : [{ route, title, Page: entry.Page }],
  };
});

// Whether a page lists its sub-pages under it in the sidebar.
export function hasSubPages(page: OptionsPage) {
  return page.subPages.length > 1;
}

// Where a route is: its page, and the sub-page shown ("/advanced/mcp" is
// MCP on Advanced; "/advanced" alone is its first sub-page).
export function optionsPlaceFor(route: string) {
  const prefix = `/${route.split("/")[1] ?? ""}`;
  const page =
    OPTIONS_PAGES.find((item) => item.route === prefix) ?? OPTIONS_PAGES[0];
  const subPage =
    page.subPages.find((item) => item.route === route) ?? page.subPages[0];
  return { page, subPage };
}
