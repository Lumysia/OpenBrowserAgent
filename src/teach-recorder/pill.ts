import { iconSvg } from "../page-toast/icons";
import { markOwnUi } from "../shared/page-ui";
import type { TeachPageConfig } from "../shared/teach/page-protocol";
import { applyTheme } from "../ui/apply-theme";
import { pageShadowCss } from "../ui/page-shadow";
import pillCss from "./pill.css?inline";

const CSS = pageShadowCss("teach-pill-theme", [], [pillCss]);

// Lucide's square, as on the side panel's stop buttons.
const STOP_ICON: Parameters<typeof iconSvg>[0] = [
  ["rect", { width: "14", height: "14", x: "5", y: "5", rx: "2" }],
];

// "Recording · Stop" on the page while it is recorded, in a closed shadow
// root out of the page's styles and scripts; always visible, so the user
// knows the page is recorded. Returns its remover.
export function showRecordingPill(config: TeachPageConfig, onStop: () => void) {
  const host = document.createElement("div");
  markOwnUi(host);
  host.setAttribute("translate", "no");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "teach-pill-theme";
  applyTheme(root, config.theme);
  const frame = document.createElement("div");
  frame.className = "teach-pill-frame";
  const pill = document.createElement("div");
  pill.className = "teach-pill page-surface";
  pill.setAttribute("role", "status");
  const dot = document.createElement("span");
  dot.className = "teach-pill-dot";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = config.messages.recording;
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "teach-pill-stop";
  stop.title = config.messages.stopHint;
  stop.append(iconSvg(STOP_ICON), config.messages.stop);
  stop.addEventListener("click", onStop);
  pill.append(dot, label, stop);
  frame.append(pill);
  root.append(frame);
  shadow.append(style, root);
  document.documentElement.append(host);
  return () => host.remove();
}
