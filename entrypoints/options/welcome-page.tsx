import { useEffect, useState } from "react";
import { PanelRight, Server, Sparkles } from "lucide-react";
import {
  Button,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { SyncJoinDisclosure } from "../../src/ui/sync-join-form";
import { ProviderList } from "./provider-list";

// First-run setup, opened on install: add an AI provider (or join sync from
// another device), then open the side panel.
export function WelcomePage() {
  const t = useMessages();
  const windowId = useCurrentWindowId();
  // The side panel opens only in answer to a click, so the window is known
  // before the click instead of looked up in it.
  const canOpenPanel = windowId !== undefined && !!chrome.sidePanel?.open;

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Sparkles />}
        title={t.setup.welcomeTitle}
        description={t.setup.welcomeDescription}
      />
      <SettingsSection
        icon={<Server />}
        title={t.sidepanel.addProvider}
        contentClassName="stack"
      >
        <ProviderList />
        <SyncJoinDisclosure />
      </SettingsSection>
      <SettingsSection
        icon={<PanelRight />}
        title={t.setup.openPanelTitle}
        description={t.setup.openPanelDescription}
      >
        {canOpenPanel && (
          <div className="row">
            <Button
              variant="secondary"
              onClick={() =>
                chrome.sidePanel.open({ windowId }).catch(console.warn)
              }
            >
              <PanelRight size={16} /> {t.setup.openPanel}
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function useCurrentWindowId() {
  const [windowId, setWindowId] = useState<number>();
  useEffect(() => {
    chrome.windows
      ?.getCurrent()
      .then((window) => setWindowId(window.id))
      .catch(console.warn);
  }, []);
  return windowId;
}
