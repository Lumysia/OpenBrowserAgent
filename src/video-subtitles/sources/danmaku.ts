// Live chat and bullet comments ("danmaku") a player draws over its video
// as page text, told apart from a caption box by layout and motion, never
// by the site or its class names. A caption box is one block of one to
// three lines that stays where it is while its text is replaced; comments
// are many separate lines at once, move across the video, or keep being
// added to one container.

export const DANMAKU = {
  // More separate lines than a caption box shows at once (rolling captions
  // show up to three).
  maxLines: 3,
  // A box moved sideways at least this far between two looks: both edges
  // the same way, by this share of the video's width or these pixels.
  moveShare: 0.02,
  minMovePx: 8,
  // Items added to one container within `streamMs` and still in it.
  streamItems: 5,
  streamMs: 3_000,
  // Text nodes looked at when counting a box's lines.
  maxTextNodes: 200,
} as const;

export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// Two pieces of text read as one line: on about the same row, with at most
// a line's height between them.
function sameLine(a: Box, b: Box) {
  const height = Math.min(a.bottom - a.top, b.bottom - b.top);
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (overlap < height / 2) return false;
  const gap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
  return gap <= height;
}

// The separate lines the text boxes `boxes` make up.
export function countLines(boxes: readonly Box[]) {
  const root = boxes.map((_, index) => index);
  const find = (index: number): number => {
    while (root[index] !== index) index = root[index] = root[root[index]!]!;
    return index;
  };
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (sameLine(boxes[i]!, boxes[j]!)) root[find(i)] = find(j);
  return boxes.filter((_, index) => find(index) === index).length;
}

// Whether a box moved across the video between two looks. A caption box
// whose text changes grows or shrinks, keeping its centre or one edge.
export function movedSideways(before: Box, after: Box, frameWidth: number) {
  const least = Math.max(DANMAKU.minMovePx, frameWidth * DANMAKU.moveShare);
  const left = after.left - before.left;
  const right = after.right - before.right;
  return (
    Math.abs(left) >= least &&
    Math.abs(right) >= least &&
    Math.sign(left) === Math.sign(right)
  );
}

// Whether items added to one container, at the times `added` (only the
// ones still in it), are a stream of comments: a caption box replaces its
// lines, removing the ones before.
export function isStream(added: readonly number[], now: number) {
  return (
    added.filter((at) => now - at <= DANMAKU.streamMs).length >=
    DANMAKU.streamItems
  );
}

// Properties that place an element sideways, as keyframes name them.
const SIDEWAYS = [
  "transform",
  "translate",
  "left",
  "right",
  "marginLeft",
  "marginRight",
  "insetInlineStart",
  "insetInlineEnd",
  "inset",
] as const;
// Absent from a keyframe: the element's own value, "none" for these.
const NONE_BY_DEFAULT = new Set<string>(["transform", "translate"]);

const zero = (value: string) =>
  value === "none" || /^[-+]?0*\.?0*(px|%)?$/.test(value) ? "0" : value;

// The sideways part of a property's value.
function sidewaysPart(property: string, value: string) {
  const parts = value.trim().split(/\s+/);
  if (property === "transform")
    return (
      [
        ...value.matchAll(
          /(matrix3d|matrix|translate3d|translatex|translate)\(([^)]*)\)/gi,
        ),
      ]
        .map(([, name, args]) => {
          const values = args!.split(",").map((part) => part.trim());
          const kind = name!.toLowerCase();
          const x =
            kind === "matrix"
              ? values[4]
              : kind === "matrix3d"
                ? values[12]
                : values[0];
          return zero(x ?? "");
        })
        .join(" ") || "0"
    );
  if (property === "translate") return zero(parts[0] ?? "");
  if (property === "inset")
    return [parts[1] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]]
      .map((part) => zero(part ?? ""))
      .join(" ");
  return zero(value.trim());
}

// Whether an animation's keyframes move its element sideways.
export function movesSideways(keyframes: readonly Record<string, unknown>[]) {
  return SIDEWAYS.some((property) => {
    const values = new Set<string>();
    for (const frame of keyframes) {
      const value = frame[property];
      if (typeof value === "string") values.add(sidewaysPart(property, value));
      else if (NONE_BY_DEFAULT.has(property)) values.add("0");
    }
    return values.size > 1;
  });
}

// Whether a running animation or transition moves `element` (or, with
// `subtree`, something in it) sideways.
export function animatesSideways(element: Element, subtree: boolean) {
  return (element.getAnimations?.({ subtree }) ?? []).some(
    (animation) =>
      animation.playState === "running" &&
      animation.effect instanceof KeyframeEffect &&
      movesSideways(animation.effect.getKeyframes()),
  );
}

// The lines of text in `scope`, leaving out ruby readings and what `skip`
// says (controls, our own layer).
export function linesIn(scope: Element, skip: (element: Element) => boolean) {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const boxes: Box[] = [];
  let seen = 0;
  for (
    let node = walker.nextNode();
    node && seen < DANMAKU.maxTextNodes;
    node = walker.nextNode()
  ) {
    const parent = node.parentElement;
    if (
      !parent ||
      !/\p{L}/u.test(node.nodeValue ?? "") ||
      parent.closest("rt, rp") ||
      skip(parent)
    )
      continue;
    seen++;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects())
      if (rect.width && rect.height) boxes.push(rect);
  }
  return countLines(boxes);
}
