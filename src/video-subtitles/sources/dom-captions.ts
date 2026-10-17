// Captions a player draws as page text over its video, for players whose
// caption data can't be read. Found by structure and layout, never by the
// site or its class names: an element over the video, outside the
// player's controls, whose text keeps changing while the video plays, and
// that isn't live chat or bullet comments (see danmaku.ts) nor the tooltip
// of a control the user points at (see pointed-controls.ts). Only the line
// on screen is known, so translations follow it with a delay.
import {
  hideCaptionBox,
  holdsSkipped,
  isOverVideo,
  isSkipped,
  playerOf,
  shownText,
} from "../player";
import {
  animatesSideways,
  DANMAKU,
  isStream,
  linesIn,
  movedSideways,
  type Box,
} from "./danmaku";
import { watchPointedControls } from "./pointed-controls";

// Text changes over the video while it plays, not from pointing at a
// control, before an element counts as its captions.
const CHANGES_TO_LOCK = 2;
// A line is final when it hasn't changed for this long, or after the
// longest wait (rolling captions change word by word).
const SETTLE_MS = 400;
const MAX_SETTLE_MS = 2_500;
// A caption box covers at most this part of the video.
const MAX_AREA_SHARE = 0.5;
const MAX_LINE_CHARS = 300;

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
  const pointer = watchPointedControls(player, video);
  // How often each element's text changed, and where it was first.
  let changes = new WeakMap<
    Element,
    { count: number; text: string; first: Box }
  >();
  // Comment layers: nothing in them is looked at again.
  const refused = new WeakSet<Element>();
  // Items with text added to each container, and when.
  const added = new WeakMap<Element, { item: Element; at: number }[]>();
  let box: Element | undefined;
  // Where the last caption box was: a player that replaces its box puts
  // the next one there.
  let boxParent: Element | undefined;
  let show: (() => void) | undefined;
  let text = "";
  let settled = "";
  let settleTimer: number | undefined;
  let changedAt = 0;

  // Over the video, small, not a control, with words in it.
  function isCandidate(element: Element) {
    if (element === player || element.contains(video)) return false;
    if (isSkipped(element) || holdsSkipped(element)) return false;
    if (!isOverVideo(element, video)) return false;
    const rect = element.getBoundingClientRect();
    const frame = video.getBoundingClientRect();
    if (rect.width * rect.height > frame.width * frame.height * MAX_AREA_SHARE)
      return false;
    const value = shownText(element);
    return value.length <= MAX_LINE_CHARS && /\p{L}/u.test(value);
  }

  // The outermost wrapper with the same text: hidden as a whole.
  function outerBox(element: Element) {
    let current = element;
    const value = shownText(element);
    while (
      current.parentElement &&
      current.parentElement !== player &&
      !current.parentElement.contains(video) &&
      shownText(current.parentElement) === value
    )
      current = current.parentElement;
    return current;
  }

  // A container of the player's own, not the player or around the video.
  function isLayer(element: Element | null): element is Element {
    return !!element && element !== player && !element.contains(video);
  }

  function isRefused(element: Element) {
    for (
      let current: Element | null = element;
      current && current !== player;
      current = current.parentElement
    )
      if (refused.has(current)) return true;
    return false;
  }

  function refuse(layer: Element) {
    refused.add(layer);
    if (box && layer.contains(box)) {
      unlock();
      update("");
    }
  }

  // The comment layer `outer` (the box about to be taken for captions,
  // `element` the part of it whose text changed) belongs to, if it does: a
  // box or its container with more lines than captions have, or a box
  // that moves sideways (it is one comment of its container), or one with
  // moving parts (it holds the comments).
  function commentLayer(outer: Element, element: Element, first?: Box) {
    const container = outer.parentElement;
    if (linesIn(outer, isSkipped) > DANMAKU.maxLines) return outer;
    if (isLayer(container) && linesIn(container, isSkipped) > DANMAKU.maxLines)
      return container;
    const frame = video.getBoundingClientRect();
    if (
      animatesSideways(outer, false) ||
      (first &&
        movedSideways(first, element.getBoundingClientRect(), frame.width))
    )
      return isLayer(container) ? container : outer;
    if (animatesSideways(outer, true)) return outer;
    return undefined;
  }

  // Items with text added to `container`: a stream of them makes it a
  // comment layer.
  function track(container: Element, items: Element[], now: number) {
    if (!isLayer(container) || refused.has(container)) return;
    const recent = (added.get(container) ?? []).filter(
      ({ item, at }) => item.isConnected && now - at <= DANMAKU.streamMs,
    );
    for (const item of items) recent.push({ item, at: now });
    added.set(container, recent);
    if (
      isStream(
        recent.map(({ at }) => at),
        now,
      )
    )
      refuse(container);
  }

  function lock(outer: Element) {
    box = outer;
    boxParent = box.parentElement ?? undefined;
    show = hideCaptionBox(box);
  }

  function unlock() {
    show?.();
    show = undefined;
    box = undefined;
  }

  // The box turned out to be a tooltip: its earlier changes may have been
  // too, so counting starts again.
  function release() {
    unlock();
    boxParent = undefined;
    changes = new WeakMap();
    update("");
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
    // Only changes while the video plays count.
    const playing = !video.paused;
    const now = performance.now();
    const seen = new Set<Element>();
    // The changed element, and new elements added to it (a player may
    // replace its caption box on each line).
    const changed: Element[] = [];
    for (const record of records) {
      const target =
        record.type === "characterData"
          ? record.target.parentElement
          : (record.target as Element);
      if (!target || isRefused(target)) continue;
      const items = [...record.addedNodes].filter(
        (node): node is Element =>
          node.nodeType === Node.ELEMENT_NODE &&
          /\p{L}/u.test(node.textContent ?? ""),
      );
      if (playing && items.length) track(target, items, now);
      changed.push(target, ...items);
    }
    if (box) {
      const value = shownText(box);
      // A tooltip taken for captions before it showed what it is.
      if (pointer.isTooltip(value)) release();
      else update(value);
      return;
    }
    if (!playing) return;
    for (const element of changed) {
      if (seen.has(element)) continue;
      seen.add(element);
      if (isRefused(element) || !isCandidate(element)) continue;
      const value = shownText(element);
      if (pointer.isTooltip(value)) {
        changes.delete(element);
        continue;
      }
      const previous = changes.get(element);
      if (previous?.text === value) continue;
      const pointed = pointer.recentlyPointed();
      const count = (previous?.count ?? 0) + (pointed ? 0 : 1);
      changes.set(element, {
        count,
        text: value,
        first: previous?.first ?? element.getBoundingClientRect(),
      });
      if (
        pointed ||
        (count < CHANGES_TO_LOCK && element.parentElement !== boxParent)
      )
        continue;
      const outer = outerBox(element);
      const layer = commentLayer(outer, element, previous?.first);
      if (layer) {
        refuse(layer);
        continue;
      }
      lock(outer);
      update(value);
      return;
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
      pointer.dispose();
      clearTimeout(settleTimer);
      unlock();
    },
  };
}
