import { useEffect } from "react";
import { Plus, Sparkles } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import { OPTIONS_HASH } from "../../src/shared/config";
import { isSetupFinished } from "../../src/shared/setup-gate";
import { openSetup } from "../../src/shared/setup-progress";
import { storage } from "../../src/shared/storage";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import { Button } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";

// The side panel without a model. Before setup is finished the panel isn't
// meant to open (the background sends every way in to setup); one that
// opened anyway opens setup and closes. After it, one line leads to adding
// an AI provider.
export function NoModelState() {
  const t = useMessages();
  const [setupDone] = useStoredState(storage.setupDone);
  const [providers] = useStoredState(storage.provider);
  const loaded = setupDone !== undefined && providers !== undefined;
  const finished = loaded && isSetupFinished(setupDone, providers);

  useEffect(() => {
    if (loaded && !finished) void leaveForSetup();
  }, [loaded, finished]);

  if (!loaded) return null;
  return (
    <div className="sidepanel no-model-mode">
      <Button
        variant="ghost"
        onClick={() =>
          void (
            finished ? openOrFocusOptions(OPTIONS_HASH.providers) : openSetup()
          ).catch(console.warn)
        }
      >
        {finished ? <Plus size={16} /> : <Sparkles size={16} />}
        {finished ? t.sidepanel.addProvider : t.setup.continueSetup}
      </Button>
    </div>
  );
}

// In the browser's side panel (not the panel page in a tab): setup, then
// the panel closes. Firefox's sidebar can't close itself, so it keeps the
// line.
async function leaveForSetup() {
  if (await getBrowserApi().tabs.getCurrent()) return;
  await openSetup();
  window.close();
}
