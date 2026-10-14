import {
  Copy,
  Search,
  Languages,
  Lightbulb,
  MessageCircleQuestionMark,
  SpellCheck,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { getBrowserApi } from "../../shared/browser-api";
import { SMART_BAR_ACTION, type SmartBarAction } from "../../shared/smart-bar";
import {
  SMART_BAR_MESSAGE,
  type SmartBarOpenSidePanelRequest,
  type SmartBarSidePanelRequest,
} from "../../shared/smart-bar-protocol";

export const SMART_BAR_ICONS: Record<SmartBarAction, LucideIcon> = {
  [SMART_BAR_ACTION.ask]: MessageCircleQuestionMark,
  [SMART_BAR_ACTION.explain]: Lightbulb,
  [SMART_BAR_ACTION.translate]: Languages,
  [SMART_BAR_ACTION.search]: Search,
  [SMART_BAR_ACTION.copy]: Copy,
  [SMART_BAR_ACTION.improve]: WandSparkles,
  [SMART_BAR_ACTION.fixGrammar]: SpellCheck,
};

// Sent from the click itself: the background opens the side panel only
// during the user's gesture.
export function openInSidePanel(request: SmartBarSidePanelRequest) {
  const message: SmartBarOpenSidePanelRequest = {
    type: SMART_BAR_MESSAGE.openSidePanel,
    request,
  };
  return send(message);
}

export function hideOnThisSite() {
  return send({ type: SMART_BAR_MESSAGE.hideOnSite });
}

export function turnOffSmartBar() {
  return send({ type: SMART_BAR_MESSAGE.turnOff });
}

function send(message: { type: string }) {
  return getBrowserApi()
    .runtime.sendMessage(message)
    .catch(() => undefined);
}
