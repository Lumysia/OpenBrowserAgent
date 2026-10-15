import { useEffect, useState } from "react";
import { getBrowserApi } from "../shared/browser-api";

export type BrowserCommand = {
  name: string;
  description: string;
  // The keys as the browser shows them; "" when none is set.
  shortcut: string;
};

// The extension's commands with their shortcuts, as the browser keeps them;
// undefined where the browser has no commands. Read again when the user
// comes back from changing them.
export function useCommands() {
  const [commands, setCommands] = useState<BrowserCommand[]>();
  useEffect(() => {
    const api = getBrowserApi().commands;
    if (!api?.getAll) return;
    let active = true;
    const read = () =>
      void api.getAll().then((all) => {
        if (active)
          setCommands(
            all.map((command) => ({
              name: command.name ?? "",
              description: command.description ?? "",
              shortcut: command.shortcut ?? "",
            })),
          );
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
  }, []);
  return commands;
}
