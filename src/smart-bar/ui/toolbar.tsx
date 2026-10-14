import { Check, EyeOff, Power, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { QUICK_FEEDBACK_MS } from "../../shared/config";
import { SIDE_PANEL_TASK } from "../../shared/side-panel-handoff";
import {
  isGenerateAction,
  SMART_BAR_ACTION,
  type SmartBarAction,
} from "../../shared/smart-bar";
import type { SmartBarPageConfig } from "../../shared/smart-bar-protocol";
import {
  Button,
  IconTooltip,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/components";
import type { SelectionSnapshot } from "../selection";
import { copyText } from "../writeback";
import {
  hideOnThisSite,
  openInSidePanel,
  SMART_BAR_ICONS,
  turnOffSmartBar,
} from "./page-actions";
import type { SmartBarStore } from "./store";
import { onTrusted } from "./trusted";

export function SmartBarToolbar({
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
  const t = config.messages;
  const { actions } = config;
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) toolbarRef.current?.querySelector("button")?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(store.hide, QUICK_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied, store]);

  const run = (action: SmartBarAction) => {
    if (isGenerateAction(action)) return store.run(action);
    if (action === SMART_BAR_ACTION.ask || action === SMART_BAR_ACTION.search) {
      void openInSidePanel({
        task:
          action === SMART_BAR_ACTION.ask
            ? SIDE_PANEL_TASK.ask
            : SIDE_PANEL_TASK.searchWeb,
        text: snapshot.text,
      });
      return store.hide();
    }
    void copyText(snapshot.text).then(setCopied);
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={t.barLabel}
      className="smart-bar-toolbar"
      onKeyDown={onTrusted(moveFocus)}
    >
      {actions.map((action) => {
        const done = copied && action === SMART_BAR_ACTION.copy;
        const Icon = done ? Check : SMART_BAR_ICONS[action];
        const label = done ? t.copied : t.actions[action];
        return (
          <IconTooltip key={action} label={label} side="top">
            <Button
              variant="ghost"
              size="icon"
              className="smart-bar-icon-button"
              aria-label={label}
              onClick={onTrusted(() => run(action))}
            >
              <Icon size={16} />
            </Button>
          </IconTooltip>
        );
      })}
      <span className="smart-bar-divider" aria-hidden="true" />
      <CloseMenu store={store} config={config} />
    </div>
  );
}

// Arrow keys move between the toolbar's buttons.
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!step) return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  buttons[(index + step + buttons.length) % buttons.length].focus();
}

function CloseMenu({
  store,
  config,
}: {
  store: SmartBarStore;
  config: SmartBarPageConfig;
}) {
  const t = config.messages;
  const open = useSyncExternalStore(
    store.subscribe,
    () => store.getState().popoverOpen,
  );
  const choose = (action: () => Promise<unknown>) => {
    void action();
    store.hide();
  };
  return (
    <Popover open={open} onOpenChange={store.setPopoverOpen}>
      <IconTooltip label={t.closeMenu} side="top">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="smart-bar-icon-button"
            aria-label={t.closeMenu}
          >
            <X size={16} />
          </Button>
        </PopoverTrigger>
      </IconTooltip>
      <PopoverContent className="smart-bar-menu" side="bottom" align="end">
        <Button
          variant="ghost"
          size="sm"
          className="smart-bar-menu-item"
          onClick={onTrusted(() => choose(hideOnThisSite))}
        >
          <EyeOff size={15} />
          <span className="smart-bar-menu-label">
            {t.hideOnSite.replace("{site}", config.hideSite)}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="smart-bar-menu-item"
          onClick={onTrusted(() => choose(turnOffSmartBar))}
        >
          <Power size={15} />
          <span className="smart-bar-menu-label">{t.turnOff}</span>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
