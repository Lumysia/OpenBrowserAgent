// The captions a player draws as page text while our layer shows the same
// lines from a caption file or text track: hidden, so the two don't sit on
// top of each other, and shown again when ours stop. Found by matching
// text, never by the site or its class names: text over the video, outside
// the player's controls and our layer, that is part of the cues around the
// playhead (see caption-match.ts). What is hidden is the box holding the
// caption lines: the outermost one around them with nothing but caption
// text, so lines the player adds or replaces in it stay hidden. A box that
// starts showing other text shows again. Captions drawn on a canvas or in a
// closed shadow root can't be found and stay.
import {
  captionKey,
  CAPTION_MATCH,
  cueKeyAround,
  isCaptionOf,
} from "../shared/video-subtitles/caption-match";
import type { Cue } from "../shared/video-subtitles/cues";
import {
  hideCaptionBox,
  holdsSkipped,
  isOverVideo,
  isSkipped,
  playerOf,
} from "./player";
import { animatesSideways, DANMAKU, linesIn } from "./sources/danmaku";
import { watchPointedControls } from "./sources/pointed-controls";

// Pictures and media: a box holding them is more than captions.
const GRAPHICS = "img, svg, canvas, video, audio, iframe, picture, object";
// Text nodes looked at when looking through the player at once.
const MAX_SCANNED = 500;

const textOf = (element: Element) => element.textContent ?? "";

export function createPlayerCaptions(video: HTMLVideoElement) {
  let cues: readonly Cue[] | undefined;
  let watching:
    | {
        player: Element;
        observer: MutationObserver;
        pointer: ReturnType<typeof watchPointedControls>;
      }
    | undefined;
  // The boxes hidden, each with what shows it again.
  const boxes = new Map<Element, () => void>();
  // Comment layers whose text matched: never hidden.
  const refused = new WeakSet<Element>();

  function release(box: Element) {
    boxes.get(box)?.();
    boxes.delete(box);
  }

  function releaseAll() {
    for (const box of [...boxes.keys()]) release(box);
  }

  // An ancestor the caption box may grow into: the player's own, not
  // around the video, without controls, our layer or pictures.
  function canHold(element: Element, player: Element) {
    return (
      element !== player &&
      player.contains(element) &&
      !element.contains(video) &&
      !holdsSkipped(element) &&
      !element.querySelector(GRAPHICS)
    );
  }

  // The box of captions `element` (whose text changed) is in, if its text
  // is the cues' around now.
  function captionBox(element: Element, key: string, player: Element) {
    if (!canHold(element, player) || isSkipped(element)) return undefined;
    if (!key.includes(captionKey(textOf(element)))) return undefined;
    // A word added to a line is too short to tell: the line around it, and
    // the box around the lines, have more of the same text.
    let box = element;
    for (
      let parent = box.parentElement;
      parent &&
      canHold(parent, player) &&
      key.includes(captionKey(textOf(parent)));
      parent = parent.parentElement
    )
      box = parent;
    return isCaptionOf(textOf(box), key) && isOverVideo(box, video)
      ? box
      : undefined;
  }

  function isRefused(element: Element, player: Element) {
    for (
      let current: Element | null = element;
      current && current !== player;
      current = current.parentElement
    )
      if (refused.has(current)) return true;
    return false;
  }

  // Bullet comments or a tooltip that happen to say what is said.
  function isCaptionLike(box: Element) {
    const pointer = watching!.pointer;
    if (pointer.isTooltip(box.textContent ?? "")) return false;
    if (
      linesIn(box, isSkipped) > DANMAKU.maxLines ||
      animatesSideways(box, true)
    ) {
      refused.add(box);
      return false;
    }
    return true;
  }

  function hide(box: Element) {
    for (const hidden of [...boxes.keys()])
      if (box.contains(hidden)) release(hidden);
    boxes.set(box, hideCaptionBox(box));
  }

  function look(changed: Iterable<Element>) {
    if (!cues || !watching) return;
    const { player } = watching;
    const key = cueKeyAround(cues, video.currentTime);
    for (const box of [...boxes.keys()]) {
      if (!box.isConnected) release(box);
      // A box that says something else now isn't the captions'.
      else if (
        [...captionKey(textOf(box))].length >= CAPTION_MATCH.minChars &&
        !key.includes(captionKey(textOf(box)))
      )
        release(box);
    }
    const seen = new Set<Element>();
    for (const element of changed) {
      if (seen.has(element) || !element.isConnected) continue;
      seen.add(element);
      if ([...boxes.keys()].some((box) => box.contains(element))) continue;
      if (isRefused(element, player)) continue;
      const box = captionBox(element, key, player);
      if (box && !boxes.has(box) && isCaptionLike(box)) hide(box);
    }
  }

  // What is in the player now, for captions already on screen.
  function scan(player: Element) {
    const walker = document.createTreeWalker(player, NodeFilter.SHOW_TEXT);
    const parents = new Set<Element>();
    for (
      let node = walker.nextNode();
      node && parents.size < MAX_SCANNED;
      node = walker.nextNode()
    )
      if (node.parentElement && /\p{L}/u.test(node.nodeValue ?? ""))
        parents.add(node.parentElement);
    look(parents);
  }

  function start() {
    const player = playerOf(video);
    const observer = new MutationObserver((records) => {
      const changed: Element[] = [];
      for (const record of records) {
        if (record.type === "characterData") {
          if (record.target.parentElement)
            changed.push(record.target.parentElement);
          continue;
        }
        changed.push(record.target as Element);
        for (const node of record.addedNodes)
          if (node.nodeType === Node.ELEMENT_NODE)
            changed.push(node as Element);
          else if (node.parentElement) changed.push(node.parentElement);
      }
      look(changed);
    });
    observer.observe(player, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    watching = {
      player,
      observer,
      pointer: watchPointedControls(player, video),
    };
    scan(player);
  }

  function stop() {
    watching?.observer.disconnect();
    watching?.pointer.dispose();
    watching = undefined;
    releaseAll();
  }

  return {
    // The cues our layer shows now (undefined: none, the player's captions
    // show again).
    follow(next: readonly Cue[] | undefined) {
      if (next === cues) return;
      cues = next?.length ? next : undefined;
      if (!cues) return stop();
      if (!watching) start();
      else scan(watching.player);
    },
    dispose: stop,
  };
}
