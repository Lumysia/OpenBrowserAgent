// Captions a player draws as page text over its video, for players whose
// caption data can't be read. Found by structure and layout, never by the
// site or its class names: an element over the video, outside the
// player's controls, whose text keeps changing while the video plays. Only
// the line on screen is known, so translations follow it with a delay.
import { OWN_ATTRIBUTE } from "../overlay";

// Text changes over the video while it plays before an element counts as
// its captions.
const CHANGES_TO_LOCK = 2;
// A line is final when it hasn't changed for this long, or after the
// longest wait (rolling captions change word by word).
const SETTLE_MS = 400;
const MAX_SETTLE_MS = 2_500;
// A caption box covers at most this part of the video.
const MAX_AREA_SHARE = 0.5;
const MAX_LINE_CHARS = 300;
// A player wraps its video in boxes about its size.
const PLAYER_AREA_SHARE = 1.6;
const CONTROLS =
  "button, input, select, textarea, a[href], [role=button], [role=slider], [role=menu], [role=menuitem], [role=tooltip], [role=dialog], [contenteditable]";

export type DomCaptions = ReturnType<typeof watchDomCaptions>;

// The player around `video`: its largest ancestor about the video's size.
export function playerOf(video: HTMLVideoElement) {
  const area = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  };
  const own = area(video);
  let player: Element = video.parentElement ?? video;
  for (
    let parent = player.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    if (own > 0 && area(parent) > own * PLAYER_AREA_SHARE) break;
    player = parent;
  }
  return player;
}

export function watchDomCaptions(
  video: HTMLVideoElement,
  {
    onText,
    onLine,
  }: {
    // The text on screen now, as it changes ("" when none).
    onText: (text: string) => void;
    // A line that stopped changing.
    onLine: (text: string) => void;
  },
) {
  const player = playerOf(video);
  const changes = new WeakMap<Element, { count: number; text: string }>();
  let box: Element | undefined;
  // Where the last caption box was: a player that replaces its box puts
  // the next one there.
  let boxParent: Element | undefined;
  let hidden:
    { element: HTMLElement; opacity: string; priority: string } | undefined;
  let text = "";
  let settled = "";
  let settleTimer: number | undefined;
  let changedAt = 0;

  function textOf(element: Element) {
    return ((element as HTMLElement).innerText ?? element.textContent ?? "")
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  // Over the video, small, not a control, with words in it.
  function isCandidate(element: Element) {
    if (element === player || element.contains(video)) return false;
    if (
      element.closest(`[${OWN_ATTRIBUTE}]`) ||
      element.querySelector(`[${OWN_ATTRIBUTE}]`)
    )
      return false;
    if (element.closest(CONTROLS) || element.querySelector(CONTROLS))
      return false;
    const rect = element.getBoundingClientRect();
    const frame = video.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom)
      return false;
    if (rect.width * rect.height > frame.width * frame.height * MAX_AREA_SHARE)
      return false;
    const value = textOf(element);
    return value.length <= MAX_LINE_CHARS && /\p{L}/u.test(value);
  }

  // The outermost wrapper with the same text: hidden as a whole.
  function outerBox(element: Element) {
    let current = element;
    const value = textOf(element);
    while (
      current.parentElement &&
      current.parentElement !== player &&
      !current.parentElement.contains(video) &&
      textOf(current.parentElement) === value
    )
      current = current.parentElement;
    return current;
  }

  function lock(element: Element) {
    box = outerBox(element);
    boxParent = box.parentElement ?? undefined;
    const target = box as HTMLElement;
    if (target.style) {
      hidden = {
        element: target,
        opacity: target.style.getPropertyValue("opacity"),
        priority: target.style.getPropertyPriority("opacity"),
      };
      target.style.setProperty("opacity", "0", "important");
    }
  }

  function unlock() {
    if (hidden)
      hidden.element.style.setProperty(
        "opacity",
        hidden.opacity,
        hidden.priority,
      );
    hidden = undefined;
    box = undefined;
  }

  function update(value: string) {
    if (value === text) return;
    text = value;
    onText(value);
    const now = performance.now();
    if (!changedAt) changedAt = now;
    clearTimeout(settleTimer);
    const wait = Math.max(
      0,
      Math.min(SETTLE_MS, changedAt + MAX_SETTLE_MS - now),
    );
    settleTimer = window.setTimeout(settle, wait);
  }

  function settle() {
    changedAt = 0;
    if (text && text !== settled) {
      settled = text;
      onLine(text);
    }
  }

  const observer = new MutationObserver((records) => {
    if (box && !box.isConnected) {
      unlock();
      update("");
    }
    if (box) {
      update(textOf(box));
      return;
    }
    // Only changes while the video plays count.
    if (video.paused) return;
    const seen = new Set<Element>();
    // The changed element, and new elements added to it (a player may
    // replace its caption box on each line).
    const changed = records.flatMap((record) => [
      record.type === "characterData"
        ? record.target.parentElement
        : (record.target as Element),
      ...[...record.addedNodes].filter(
        (node): node is Element => node.nodeType === Node.ELEMENT_NODE,
      ),
    ]);
    for (const element of changed) {
      if (!element || seen.has(element)) continue;
      seen.add(element);
      if (!isCandidate(element)) continue;
      const value = textOf(element);
      const previous = changes.get(element);
      if (previous?.text === value) continue;
      const count = (previous?.count ?? 0) + 1;
      changes.set(element, { count, text: value });
      if (count >= CHANGES_TO_LOCK || element.parentElement === boxParent) {
        lock(element);
        update(value);
        return;
      }
    }
  });
  observer.observe(player, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  return {
    get found() {
      return !!box;
    },
    dispose() {
      observer.disconnect();
      clearTimeout(settleTimer);
      unlock();
    },
  };
}
