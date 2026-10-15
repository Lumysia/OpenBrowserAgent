import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import { BROWSER_SHORTCUTS_URL } from "../../src/shared/config";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import { Button, CardDescription } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

// Firefox (moz-extension pages) has no page to open for its shortcut
// settings.
const SHORTCUTS_PAGE = getBrowserApi()
  .runtime.getURL("")
  .startsWith("moz-extension:")
  ? undefined
  : BROWSER_SHORTCUTS_URL;

// One of the extension's commands: its keys and "Change shortcut" (or, in
// Firefox, where to change it). Nothing where the browser has no commands.
export function CommandShortcut({ command }: { command: string }) {
  const t = useMessages();
  const s = t.settings;
  const shortcut = useCommandShortcut(command);
  if (shortcut === undefined) return null;
  return (
    <>
      <div className="split">
        <CardDescription>
          {shortcut
            ? s.commandShortcut.current.replace("{shortcut}", shortcut)
            : s.commandShortcut.none}
        </CardDescription>
        {SHORTCUTS_PAGE && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openOrFocusUrl(SHORTCUTS_PAGE)}
          >
            <ExternalLink size={14} />
            {s.commandShortcut.change}
          </Button>
        )}
      </div>
      {!SHORTCUTS_PAGE && (
        <CardDescription>{s.shortcutsFirefoxHint}</CardDescription>
      )}
    </>
  );
}

// The keys of one of the extension's commands, as the browser shows them:
// "" when none is set, undefined where the browser has no commands. Read
// again when the user comes back from changing it.
function useCommandShortcut(name: string) {
  const [shortcut, setShortcut] = useState<string>();
  useEffect(() => {
    const commands = getBrowserApi().commands;
    if (!commands?.getAll) return;
    let active = true;
    const read = () =>
      void commands.getAll().then((all) => {
        const command = all.find((item) => item.name === name);
        if (active) setShortcut(command && (command.shortcut ?? ""));
      });
    read();
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    addEventListener("focus", read);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [name]);
  return shortcut;
}
