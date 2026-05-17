import { useEffect } from "react";
import type { ReactNode } from "react";
import { OPTIONS_HASH, OPTIONS_ROUTE } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { ScrollArea } from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { GeneralPage } from "./general-page";
import { ProvidersPage } from "./providers-page";
import { QuickActionsPage } from "./quick-actions-page";
import { useHashRoute } from "./route";
import { SyncPage } from "./sync-page";

export function OptionsApp() {
  const route = useHashRoute();
  const [language] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const version = chrome.runtime.getManifest().version;
  const t = getMessages(language);

  useEffect(() => {
    document.documentElement.dataset.accent =
      preferences?.accentColor || "amber";
    document.documentElement.dataset.theme =
      preferences?.colorScheme || "system";
  }, [preferences?.accentColor, preferences?.colorScheme]);

  return (
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
          >
            {t.options.general}
          </OptionsLink>
          <OptionsLink
            route={route}
            target={OPTIONS_ROUTE.sync}
            href={OPTIONS_HASH.sync}
          >
            {t.options.sync}
          </OptionsLink>
          <OptionsLink
            route={route}
            target={OPTIONS_ROUTE.providers}
            href={OPTIONS_HASH.providers}
          >
            {t.options.providers}
          </OptionsLink>
          <OptionsLink
            route={route}
            target={OPTIONS_ROUTE.quickActions}
            href={OPTIONS_HASH.quickActions}
          >
            {t.options.quickActions}
          </OptionsLink>
          <a
            className="nav-link"
            href="https://github.com/Lumysia/OpenBrowserAgent"
            target="_blank"
            rel="noreferrer"
          >
            {t.common.help}
          </a>
        </nav>
        <div className="settings-sidebar-version">v{version}</div>
      </aside>
      <ScrollArea className="settings-main">
        <div className="settings-content">
          {route === OPTIONS_ROUTE.providers ? (
            <ProvidersPage />
          ) : route === OPTIONS_ROUTE.sync ? (
            <SyncPage />
          ) : route === OPTIONS_ROUTE.quickActions ? (
            <QuickActionsPage />
          ) : (
            <GeneralPage />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function OptionsLink({
  route,
  target,
  href,
  children,
}: {
  route: string;
  target: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <a className={`nav-link ${route === target ? "active" : ""}`} href={href}>
      {children}
    </a>
  );
}
