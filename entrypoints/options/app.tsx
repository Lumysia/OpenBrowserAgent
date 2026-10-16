import { TOOLTIP_DELAY_MS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { ScrollArea, TooltipProvider } from "../../src/ui/components";
import { useTheme } from "../../src/ui/theme";
import { useDocumentLanguage } from "../../src/ui/use-document-language";
import { useSyncPageState } from "../../src/ui/useSyncPageState";
import { useStoredState } from "../../src/ui/useStoredState";
import { MessagesProvider } from "../../src/ui/messages";
import { optionsPlaceFor } from "./pages";
import { useHashRoute } from "./route";
import { SettingsNav } from "./settings-nav";

export function OptionsApp() {
  const route = useHashRoute();
  const { page, subPage } = optionsPlaceFor(route);
  const [language, , languageLoading] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const version = chrome.runtime.getManifest().version;
  const t = getMessages(language);

  useSyncPageState();

  useTheme(document.documentElement, preferences ?? {});
  useDocumentLanguage(language);

  return languageLoading ? null : (
    <MessagesProvider language={language}>
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        {page.standalone ? (
          <div className="standalone-shell">
            <subPage.Page />
          </div>
        ) : (
          <div className="app-shell">
            <aside className="settings-sidebar">
              <div>
                <div className="brand">{t.common.settings}</div>
                <p className="muted">
                  {t.app.brandLine.replace("{tagline}", t.app.tagline)}
                </p>
              </div>
              <SettingsNav route={route} />
              <div className="settings-sidebar-version">v{version}</div>
            </aside>
            <ScrollArea className="settings-main">
              <div className="settings-content">
                <subPage.Page />
              </div>
            </ScrollArea>
          </div>
        )}
      </TooltipProvider>
    </MessagesProvider>
  );
}
