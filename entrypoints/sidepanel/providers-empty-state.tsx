import { Bot, Plus } from "lucide-react";
import { LOCAL_SETUP_FEEDBACK_MS, OPTIONS_HASH } from "../../src/shared/config";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { SyncJoinDisclosure } from "../../src/ui/sync-join-form";
import { UI_STATE, stateWhen } from "../../src/ui/ui-state";
import { useTransient } from "../../src/ui/use-transient";

// The side panel before any model exists: add an AI provider on the setup
// page, or join sync from another device.
export function ProvidersEmptyState() {
  const t = useMessages();
  const [openedSettings, showOpenedSettings] = useTransient<true>(
    LOCAL_SETUP_FEEDBACK_MS,
  );

  function addProvider() {
    showOpenedSettings(true);
    openOrFocusOptions(OPTIONS_HASH.welcome).catch(console.warn);
  }

  return (
    <div className="sidepanel setup-mode">
      <div className="messages-shell">
        <ScrollArea className="messages">
          <div className="empty">
            <Card className="stack setup-card">
              <CardHeader>
                <Bot size={34} />
                <CardTitle>{t.setup.title}</CardTitle>
                <CardDescription>{t.setup.description}</CardDescription>
              </CardHeader>
              <CardContent className="setup-card-actions">
                <Button onClick={addProvider}>
                  <Plus size={16} /> {t.sidepanel.addProvider}
                </Button>
                <CardDescription
                  aria-hidden={!openedSettings}
                  className="setup-feedback local-setup-hint"
                  data-state={stateWhen(openedSettings, UI_STATE.visible)}
                >
                  {t.setup.openedSettings}
                </CardDescription>
                <SyncJoinDisclosure />
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
