import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveTab } from "../../src/shared/browser";
import { getBrowserApi } from "../../src/shared/browser-api";
import {
  PAGE_TOOLS_MESSAGE,
  type PageToolChange,
  type PageToolsChangeMessage,
  type PageToolsState,
  type PageToolsStateMessage,
} from "../../src/shared/page-tools";
import type { RuntimeReply } from "../../src/shared/runtime-messages";

// The page tools of the active tab, read from the background again whenever
// it says they may have changed (another tab or page, a translation, the
// settings).
export function usePageTools() {
  const [state, setState] = useState<PageToolsState>();
  const tabIdRef = useRef<number>(undefined);
  // Only the newest read counts.
  const readRef = useRef(0);

  const ask = useCallback(
    async (message: PageToolsStateMessage | PageToolsChangeMessage) => {
      const read = ++readRef.current;
      const reply = (await getBrowserApi()
        .runtime.sendMessage(message)
        .catch(() => undefined)) as RuntimeReply<PageToolsState> | undefined;
      if (read === readRef.current)
        setState(reply?.ok ? reply.value : undefined);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const tab = await getActiveTab().catch(() => undefined);
    tabIdRef.current = tab?.id;
    if (tab?.id === undefined) {
      readRef.current++;
      setState(undefined);
      return;
    }
    await ask({ type: PAGE_TOOLS_MESSAGE.state, tabId: tab.id });
  }, [ask]);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string } | undefined) => {
      if (message?.type === PAGE_TOOLS_MESSAGE.changed) void refresh();
    };
    const api = getBrowserApi();
    api.runtime.onMessage.addListener(listener);
    return () => api.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  const change = useCallback(
    (next: PageToolChange) => {
      const tabId = tabIdRef.current;
      if (tabId === undefined) return;
      void ask({ type: PAGE_TOOLS_MESSAGE.change, tabId, change: next });
    },
    [ask],
  );

  return { state, change };
}
