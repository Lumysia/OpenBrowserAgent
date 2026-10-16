import { Settings } from "lucide-react";
import { PRODUCT_NAME, TOOLTIP_DELAY_MS } from "../../src/shared/config";
import { storage } from "../../src/shared/storage";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import { Button, IconTooltip, TooltipProvider } from "../../src/ui/components";
import { MessagesProvider, useMessages } from "../../src/ui/messages";
import { useTheme } from "../../src/ui/theme";
import { TranslateIntoSelect } from "../../src/ui/translate-into-select";
import { useDocumentLanguage } from "../../src/ui/use-document-language";
import { useStoredState } from "../../src/ui/useStoredState";
import { OpenSidePanelButton } from "./open-side-panel-button";
import { PageToolTiles } from "./page-tool-tiles";
import { usePageTools } from "./use-page-tools";

export function MenuApp() {
  const [language, , languageLoading] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  useTheme(document.documentElement, preferences ?? {});
  useDocumentLanguage(language);
  return languageLoading ? null : (
    <MessagesProvider language={language}>
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <ToolbarMenu />
      </TooltipProvider>
    </MessagesProvider>
  );
}

// The toolbar button's menu, top to bottom: the extension and Settings, the
// active page's site and its tools, "Translate into", and the side panel,
// the most used, nearest the bottom.
function ToolbarMenu() {
  const t = useMessages();
  const { state, change } = usePageTools();
  const [before, after = ""] = t.pageTools.translateInto.split("{language}");
  return (
    <main className="toolbar-menu">
      <header className="toolbar-menu-header">
        <img src="/icons/32.png" alt="" width={20} height={20} />
        <span className="toolbar-menu-name">{PRODUCT_NAME}</span>
        <IconTooltip label={t.common.settings}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.common.settings}
            onClick={() =>
              openOrFocusOptions().then(() => window.close(), console.warn)
            }
          >
            <Settings size={18} />
          </Button>
        </IconTooltip>
      </header>
      <section className="toolbar-menu-tools" aria-labelledby="menu-site">
        <h1
          id="menu-site"
          className="toolbar-menu-site"
          data-web={state ? !!state.host : undefined}
        >
          {state === undefined ? "" : state?.host || t.pageTools.notWebPage}
        </h1>
        <PageToolTiles state={state} change={change} />
        <p className="toolbar-menu-translate-into">
          {before}
          <TranslateIntoSelect variant="inline" />
          {after}
        </p>
      </section>
      <OpenSidePanelButton />
    </main>
  );
}
