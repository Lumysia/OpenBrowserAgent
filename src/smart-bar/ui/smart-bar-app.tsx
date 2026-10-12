import { useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { TOOLTIP_DELAY_MS } from "../../shared/config";
import type { SmartBarPageConfig } from "../../shared/smart-bar-protocol";
import { PortalContainerProvider, TooltipProvider } from "../../ui/components";
import type { SelectionSnapshot } from "../selection";
import { SmartBarResultCard } from "./result-card";
import type { SmartBarStore } from "./store";
import { SmartBarToolbar } from "./toolbar";
import { usePlacement } from "./use-placement";

export function SmartBarApp({ store }: { store: SmartBarStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [theme, setTheme] = useState<HTMLDivElement | null>(null);
  const { snapshot, config } = state;
  if (!snapshot || !config) return null;
  return (
    <div
      ref={setTheme}
      className="smart-bar-theme"
      data-theme={config.colorScheme}
      data-accent={config.accentColor}
    >
      <PortalContainerProvider container={theme || undefined}>
        <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
          <SmartBarFrame
            key={state.id}
            store={store}
            snapshot={snapshot}
            config={config}
            autoFocus={state.reason === "shortcut"}
          />
        </TooltipProvider>
      </PortalContainerProvider>
    </div>
  );
}

function SmartBarFrame({
  store,
  snapshot,
  config,
  autoFocus,
}: {
  store: SmartBarStore;
  snapshot: SelectionSnapshot;
  config: SmartBarPageConfig;
  autoFocus: boolean;
}) {
  const result = useSyncExternalStore(
    store.subscribe,
    () => store.getState().result,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  // The toolbar goes with its selection; a result stays at the viewport edge.
  usePlacement(frameRef, snapshot, result ? undefined : store.hide);

  // Clicks must not take the selection or the field's focus away. The result
  // text stays selectable; accepted risk: what the user selects there is in
  // the page's selection too, as the user chose.
  const keepSelection = (event: MouseEvent) => {
    const target = event.target as Element;
    if (!target.closest(".smart-bar-result-text")) event.preventDefault();
  };

  return (
    <div ref={frameRef} className="smart-bar-frame" onMouseDown={keepSelection}>
      {result ? (
        <SmartBarResultCard
          store={store}
          snapshot={snapshot}
          config={config}
          result={result}
        />
      ) : (
        <SmartBarToolbar
          store={store}
          snapshot={snapshot}
          config={config}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}
