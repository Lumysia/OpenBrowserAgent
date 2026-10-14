// The small button on a video's corner, shown while the pointer is over the
// video: it starts or stops translated subtitles for that video. Any
// `<video>` gets it; nothing depends on the player. Registered on every
// page while the button is on (see background/video-subtitles), so it is
// kept small: the subtitle script is injected only when pressed. Only the
// user's own pointer and clicks count: page events are never trusted.
import { getBrowserApi } from "../shared/browser-api";
import { isExtensionContextValid } from "../shared/extension-context";
import { STORAGE_KEYS } from "../shared/storage-keys";
import {
  MIN_VIDEO_SIZE,
  VIDEO_SUBTITLES_MESSAGE,
  videoSubtitlesShared,
  type VideoButtonConfig,
} from "../shared/video-subtitles/protocol";
import { iconSvg } from "../page-toast/icons";
import { applyTheme } from "../ui/apply-theme";
import { pageShadowCss } from "../ui/page-shadow";
import { OWN_ATTRIBUTE } from "./overlay";
import buttonCss from "./video-button.css?inline";

const INSTALLED = Symbol.for("oba.videoButton");
const ROOT_CLASS = "video-button-theme";
const CSS = pageShadowCss(ROOT_CLASS, [], [buttonCss]);
// Lucide's "captions".
const ICON: Parameters<typeof iconSvg>[0] = [
  ["rect", { width: "18", height: "14", x: "3", y: "5", rx: "2", ry: "2" }],
  ["path", { d: "M7 15h4M15 15h2M7 11h2M13 11h4" }],
];
// The button leaves this long after the pointer stops moving.
const IDLE_MS = 2_500;
// From the video's top-right corner.
const INSET_PX = 8;

export function installVideoButton() {
  const scope = globalThis as { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;

  const shared = videoSubtitlesShared();
  let host: HTMLElement | undefined;
  let root: HTMLElement | undefined;
  let button: HTMLButtonElement | undefined;
  let config: VideoButtonConfig | undefined;
  let current: HTMLVideoElement | undefined;
  let idleTimer: number | undefined;
  let frame: number | undefined;
  let point = { x: 0, y: 0 };

  const videoAt = (x: number, y: number) => {
    for (const video of document.getElementsByTagName("video")) {
      const rect = video.getBoundingClientRect();
      if (
        rect.width >= MIN_VIDEO_SIZE.width &&
        rect.height >= MIN_VIDEO_SIZE.height &&
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      )
        return video;
    }
    return undefined;
  };

  function create() {
    host = document.createElement("div");
    host.setAttribute(OWN_ATTRIBUTE, "");
    host.setAttribute("translate", "no");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    button = document.createElement("button");
    button.type = "button";
    button.className = "video-button page-surface";
    button.hidden = true;
    button.append(iconSvg(ICON));
    button.addEventListener("click", (event) => {
      if (!event.isTrusted || !current) return;
      event.preventDefault();
      event.stopPropagation();
      shared.pointed = new WeakRef(current);
      void send({ type: VIDEO_SUBTITLES_MESSAGE.button });
    });
    // The player under it doesn't see presses meant for the button.
    for (const type of ["pointerdown", "mousedown", "dblclick"])
      button.addEventListener(type, (event) => event.stopPropagation());
    root.append(button);
    shadow.append(style, root);
  }

  // The settings it follows, again when they change.
  function configure() {
    void send({ type: VIDEO_SUBTITLES_MESSAGE.config }).then((reply) => {
      config = reply as VideoButtonConfig | undefined;
      if (config && root) applyTheme(root, config.theme);
      update();
    });
  }

  function send(message: { type: string }) {
    if (!isExtensionContextValid()) return Promise.resolve(undefined);
    return getBrowserApi()
      .runtime.sendMessage(message)
      .catch(() => undefined);
  }

  function update() {
    if (!button) return;
    const video = current;
    const rect = video?.getBoundingClientRect();
    const labels = config?.enabled ? config.labels : undefined;
    if (!video?.isConnected || !rect || !labels) {
      button.hidden = true;
      return;
    }
    const fullscreen = document.fullscreenElement;
    // Nothing shows over a video that is itself fullscreen.
    if (fullscreen === video) {
      button.hidden = true;
      return;
    }
    const parent = fullscreen?.contains(video)
      ? fullscreen
      : document.documentElement;
    if (host!.parentNode !== parent) parent.append(host!);
    const active = !!shared.isActive?.(video);
    const label = active ? labels.stop : labels.start;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);
    button.title = label;
    button.style.top = `${Math.max(rect.top, 0) + INSET_PX}px`;
    button.style.left = `${rect.right - INSET_PX - button.offsetWidth}px`;
    button.hidden = false;
  }

  function hide() {
    current = undefined;
    if (button) button.hidden = true;
  }

  function track() {
    frame = undefined;
    const video = videoAt(point.x, point.y);
    if (!video) {
      // Leaving the video over the button keeps it.
      if (!button?.matches(":hover")) hide();
      return;
    }
    current = video;
    if (!host) {
      create();
      configure();
    }
    update();
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!button?.matches(":hover, :focus-visible")) hide();
    }, IDLE_MS);
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      if (!event.isTrusted || event.pointerType === "touch") return;
      point = { x: event.clientX, y: event.clientY };
      frame ??= requestAnimationFrame(track);
    },
    { capture: true, passive: true },
  );
  // The right-clicked video, for the menu's "Translate subtitles".
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!event.isTrusted) return;
      const video = videoAt(event.clientX, event.clientY);
      if (video) shared.pointed = new WeakRef(video);
    },
    { capture: true, passive: true },
  );
  document.addEventListener("fullscreenchange", () => update());
  // The subtitle script says when a video starts or stops.
  shared.listeners.add(update);
  getBrowserApi().storage.onChanged.addListener((changes) => {
    if (
      host &&
      (changes[STORAGE_KEYS.preferences] || changes[STORAGE_KEYS.language])
    )
      configure();
  });
}
