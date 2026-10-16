import { Card, CardContent, Feedback } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { SyncUnlockForm } from "../../src/ui/sync-unlock-form";

// The returning path's passphrase step, there when synced API keys are
// sealed with a sync passphrase: the one the other device set unlocks them
// (a wrong one says so). Skip leaves them locked for now.
export function SetupPassphraseStep({
  unlocked,
  onUnlocked,
}: {
  unlocked: boolean;
  onUnlocked: () => void;
}) {
  const s = useMessages().setup;
  if (unlocked)
    return <Feedback className="setup-feedback">{s.keysUnlocked}</Feedback>;
  return (
    <Card>
      <CardContent>
        <SyncUnlockForm onDone={onUnlocked} />
      </CardContent>
    </Card>
  );
}
