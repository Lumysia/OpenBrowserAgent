import { CircleHelp } from "lucide-react";
import { REPO_URL, TOOLTIP_DELAY_MS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import { ScrollArea, TooltipProvider } from "../../src/ui/components";
import { useTheme } from "../../src/ui/theme";
import { useDocumentLanguage } from "../../src/ui/use-document-language";
import { cn } from "../../src/ui/utils";
import { useSyncPageState } from "../../src/ui/useSyncPageState";
import { useStoredState } from "../../src/ui/useStoredState";
import { MessagesProvider } from "../../src/ui/messages";
import { OPTIONS_PAGES, optionsPageFor } from "./pages";
import { useHashRoute } from "./route";

export function OptionsApp() {
  const page = optionsPageFor(useHashRoute());
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
        <div className="app-shell">
          <aside className="settings-sidebar">
            <div>
              <div className="brand">{t.common.settings}</div>
              <p className="muted">
                {t.app.brandLine.replace("{tagline}", t.app.tagline)}
              </p>
            </div>
            <nav className="stack">
              {OPTIONS_PAGES.map(({ id, hash, icon: Icon, title }) => (
                <a
                  key={id}
                  className={cn("nav-link", id === page.id && "active")}
                  href={hash}
                >
                  <Icon size={16} />
                  {title(t, language)}
                </a>
              ))}
              <a
                className="nav-link"
                href={REPO_URL}
                onClick={(event) => {
                  event.preventDefault();
                  openOrFocusUrl(REPO_URL).catch(console.warn);
                }}
              >
                <CircleHelp size={16} />
                {t.common.help}
              </a>
            </nav>
            <div className="settings-sidebar-version">v{version}</div>
          </aside>
          <ScrollArea className="settings-main">
            <div className="settings-content">
              <page.Page />
            </div>
          </ScrollArea>
        </div>
      </TooltipProvider>
    </MessagesProvider>
  );
}
