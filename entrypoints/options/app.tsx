import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import {
  Bug,
  Bot,
  CircleHelp,
  Cloud,
  FileText,
  Plug,
  Server,
  SlidersHorizontal,
  TerminalSquare,
} from "lucide-react";
import {
  OPTIONS_HASH,
  OPTIONS_ROUTE,
  TOOLTIP_DELAY_MS,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { ScrollArea, TooltipProvider } from "../../src/ui/components";
import { useRemoteSyncRefresh } from "../../src/ui/useRemoteSyncRefresh";
import { useStoredState } from "../../src/ui/useStoredState";
import { DebugPage } from "./debug-page";
import { AgentsPage } from "./agents-page";
import { GeneralPage } from "./general-page";
import { ProvidersPage } from "./providers-page";
import { McpPage } from "./mcp-page";
import { LocalExecutionBridgesPage } from "./local-execution-bridges-page";
import { SkillsPage } from "./skills-page";
import { useHashRoute } from "./route";
import { SyncPage } from "./sync-page";

export function OptionsApp() {
  const route = useHashRoute();
  const [language, , languageLoading] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const [syncDataSettings] = useStoredState(storage.syncDataSettings);
  const version = chrome.runtime.getManifest().version;
  const t = getMessages(language);

  useRemoteSyncRefresh(syncDataSettings);

  useLayoutEffect(() => {
    document.documentElement.dataset.accent =
      preferences?.accentColor || "pink";
    document.documentElement.dataset.theme =
      preferences?.colorScheme || "system";
  }, [preferences?.accentColor, preferences?.colorScheme]);

  return languageLoading ? null : (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div className="app-shell">
        <aside className="settings-sidebar">
          <div>
            <div className="brand">{t.common.settings}</div>
            <p className="muted">OpenBrowserAgent - {t.app.tagline}</p>
          </div>
          <nav className="stack">
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.general}
              href={OPTIONS_HASH.general}
              icon={<SlidersHorizontal size={16} />}
            >
              {t.options.general}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.agents}
              href={OPTIONS_HASH.agents}
              icon={<Bot size={16} />}
            >
              {t.options.agents}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.sync}
              href={OPTIONS_HASH.sync}
              icon={<Cloud size={16} />}
            >
              {t.options.sync}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.providers}
              href={OPTIONS_HASH.providers}
              icon={<Server size={16} />}
            >
              {t.options.providers}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.mcp}
              href={OPTIONS_HASH.mcp}
              icon={<Plug size={16} />}
            >
              {t.options.mcpServers}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.localExecutionBridges}
              href={OPTIONS_HASH.localExecutionBridges}
              icon={<TerminalSquare size={16} />}
            >
              {t.options.localExecutionBridges}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.skills}
              href={OPTIONS_HASH.skills}
              icon={<FileText size={16} />}
            >
              {t.options.skills}
            </OptionsLink>
            <OptionsLink
              route={route}
              target={OPTIONS_ROUTE.debug}
              href={OPTIONS_HASH.debug}
              icon={<Bug size={16} />}
            >
              {t.options.debug}
            </OptionsLink>
            <a
              className="nav-link"
              href="https://github.com/Lumysia/OpenBrowserAgent"
              target="_blank"
              rel="noreferrer"
            >
              <CircleHelp size={16} />
              {t.common.help}
            </a>
          </nav>
          <div className="settings-sidebar-version">v{version}</div>
        </aside>
        <ScrollArea className="settings-main">
          <div className="settings-content">
            {route === OPTIONS_ROUTE.agents ? (
              <AgentsPage />
            ) : route === OPTIONS_ROUTE.providers ? (
              <ProvidersPage />
            ) : route === OPTIONS_ROUTE.mcp ? (
              <McpPage />
            ) : route === OPTIONS_ROUTE.localExecutionBridges ? (
              <LocalExecutionBridgesPage />
            ) : route === OPTIONS_ROUTE.sync ? (
              <SyncPage />
            ) : route === OPTIONS_ROUTE.skills ? (
              <SkillsPage />
            ) : route === OPTIONS_ROUTE.debug ? (
              <DebugPage />
            ) : (
              <GeneralPage />
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

function OptionsLink({
  route,
  target,
  href,
  icon,
  children,
}: {
  route: string;
  target: string;
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <a className={`nav-link ${route === target ? "active" : ""}`} href={href}>
      {icon}
      {children}
    </a>
  );
}
