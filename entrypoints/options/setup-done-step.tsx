import { PanelRight, Server } from "lucide-react";
import { setupNeedsProviderNote } from "../../src/shared/setup-steps";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  Feedback,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { ShortcutsSection } from "./shortcuts-section";
import { useOpenSidePanel } from "./use-open-side-panel";

// Setup's last step: open the side panel, the keyboard shortcuts as the
// browser has them now, and, without a model yet, a note that chat needs an
// AI provider with the way back to that step.
export function SetupDoneStep({
  hasChatModel,
  onAddProvider,
}: {
  hasChatModel: boolean;
  onAddProvider: () => void;
}) {
  const t = useMessages();
  const s = t.setup;
  const openSidePanel = useOpenSidePanel();
  return (
    <div className="stack">
      {setupNeedsProviderNote("done", hasChatModel) && (
        <Card className="setup-note">
          <CardContent className="split">
            <Feedback>{s.noProviderNote}</Feedback>
            <Button variant="outline" size="sm" onClick={onAddProvider}>
              <Server size={14} /> {t.sidepanel.addProvider}
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="setup-open-panel">
          {openSidePanel ? (
            <Button onClick={openSidePanel}>
              <PanelRight size={16} /> {s.openPanel}
            </Button>
          ) : (
            <CardDescription>{s.openPanelDescription}</CardDescription>
          )}
        </CardContent>
      </Card>
      <ShortcutsSection />
    </div>
  );
}
