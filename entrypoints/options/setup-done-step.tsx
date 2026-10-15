import { Server } from "lucide-react";
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

// Setup's last step: the keyboard shortcuts as the browser has them now,
// and, without a model yet, a note that chat needs an AI provider with the
// way back to that step. "Open side panel" is its forward button; where the
// side panel can't be opened from here, how to open it.
export function SetupDoneStep({
  hasChatModel,
  canOpenPanel,
  onAddProvider,
}: {
  hasChatModel: boolean;
  canOpenPanel: boolean;
  onAddProvider: () => void;
}) {
  const t = useMessages();
  const s = t.setup;
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
      {!canOpenPanel && (
        <Card>
          <CardContent>
            <CardDescription>{s.openPanelDescription}</CardDescription>
          </CardContent>
        </Card>
      )}
      <ShortcutsSection />
    </div>
  );
}
