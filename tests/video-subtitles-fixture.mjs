import { readFile } from "node:fs/promises";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { poll } from "./chromium.mjs";
import { startPageTranslate } from "./page-translate-fixture.mjs";
import { hasClass, inShadowRoot } from "./shadow-roots.mjs";
import { rollingPages } from "./video-subtitles-rolling-fixture.mjs";

// Test helpers for translated video subtitles: pages with the kinds of
// players the feature reads (a <track>, cues a player adds over time,
// captions drawn as page text, a player that loads its own json3 file), all
// on our own made-up lines. The video is a silent black clip made with
// `ffmpeg -f lavfi -i color=c=black:s=160x90:r=1 -t 200 -c:v libvpx -b:v 1k
// -g 200 blank.webm`, long enough to seek in. `frames.webm` shows a bright
// frame for its first 10 seconds and a dark one for the next 10 (two
// `color=c=0xe8eef3` and `color=c=0x16181d` clips, 320x180, concatenated),
// for how subtitles read on both.

export const VIDEO_SECONDS = 200;
const video = await readFile(
  new URL("fixtures/video/blank.webm", import.meta.url),
);
const frames = await readFile(
  new URL("fixtures/video/frames.webm", import.meta.url),
);
// When `/frames` shows its bright frame and its dark one, each during a line.
export const FRAME_SECONDS = { bright: 1, dark: 11 };

export const VIDEO_TAG = `<video id="video" src="/blank.webm" muted playsinline preload="auto" style="display:block;width:640px;height:360px"`;
export const STYLE = `<style>body{margin:16px;font:16px system-ui}</style>`;

// A line every five seconds, said for four.
export const lineAt = (seconds) => `Line at ${seconds} seconds.`;
const times = Array.from({ length: VIDEO_SECONDS / 5 }, (_, i) => i * 5);
const clock = (seconds) =>
  `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.000`;

const vtt = [
  "WEBVTT",
  "",
  ...times.flatMap((t) => [`${clock(t)} --> ${clock(t + 4)}`, lineAt(t), ""]),
].join("\n");

const json3 = JSON.stringify({
  events: times.map((t) => ({
    tStartMs: t * 1000,
    dDurationMs: 4000,
    segs: [{ utf8: `Stub line at ${t} seconds.` }],
  })),
});

// A player's caption file that starts with a watermark: a cue that is only
// a ruby annotation, in a corner. Lines from 10 seconds on.
const watermarked = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:05.000 line:0% align:end size:15%",
  "<ruby><rt>Example Site</rt></ruby>",
  "",
  ...times
    .filter((t) => t >= 10)
    .flatMap((t) => [`${clock(t)} --> ${clock(t + 4)}`, lineAt(t), ""]),
].join("\n");
// The previews over a seek bar, as a WebVTT file of picture references.
const thumbnails = [
  "WEBVTT",
  "",
  ...times.flatMap((t) => [
    `${clock(t)} --> ${clock(t + 5)}`,
    `preview-01.jpg#xywh=${(t / 5) * 160},0,160,90`,
    "",
  ]),
].join("\n");
const UNNAMED = { "Content-Type": "application/octet-stream" };

// What viewers write in a live player's bullet comments.
export const COMMENTS = [
  "So good!",
  "Hello from the chat",
  "This part again",
  "Who else is watching",
  "Nice shot",
  "Best scene so far",
];

// A live player with bullet comments flying right to left over the top
// half of its video, a new one every 300 ms, each a new element animated
// with a CSS transform; with `pool`, three lane elements reused for them
// and moved with the Web Animations API, like players that recycle them.
const danmakuPage = ({ track = false, pool = false } = {}) =>
  `<!doctype html><html lang="en"><head><title>Live player</title>${STYLE}
<style>@keyframes fly{from{transform:translateX(0)}to{transform:translateX(-900px)}}#comments>div{position:absolute;left:100%;white-space:nowrap;color:#fff;font-size:20px;animation:fly 6s linear forwards}</style></head><body>
<div id="player" style="position:relative;width:640px;height:360px;overflow:hidden">
${VIDEO_TAG.replace('style="', 'autoplay loop style="')}>${track ? '<track kind="subtitles" srclang="en" label="English" src="/captions.vtt" default>' : ""}</video>
<div id="comments" style="position:absolute;left:0;right:0;top:0;height:50%"></div>
</div>
<script>
const video = document.getElementById("video");
const comments = document.getElementById("comments");
const words = ${JSON.stringify(COMMENTS)};
const lanes = ${pool} ? [0, 1, 2].map((lane) => {
  const item = document.createElement("div");
  item.style.cssText = "top:" + lane * 40 + "px;left:60%;animation:none";
  comments.append(item);
  return item;
}) : [];
window.comments = 0;
setInterval(() => {
  if (video.paused) return;
  const n = window.comments++;
  const text = words[n % words.length] + " " + n;
  if (lanes.length) {
    const item = lanes[n % lanes.length];
    item.getAnimations().forEach((animation) => animation.cancel());
    item.textContent = text;
    item.animate([{ transform: "translateX(0)" }, { transform: "translateX(-600px)" }], { duration: 2000, fill: "forwards" });
    return;
  }
  const item = document.createElement("div");
  item.textContent = text;
  item.style.top = (n % 5) * 34 + "px";
  item.addEventListener("animationend", () => item.remove());
  comments.append(item);
}, 300);
</script>
</body></html>`;

// The controls of a player that shows their names as tooltips.
export const CONTROL_LABELS = ["Play", "Mute (m)", "Settings", "Full screen"];
// The chapters on its seek bar, whose names show as the pointer goes along
// it (no control is called that).
export const CHAPTERS = ["Into the valley", "The crossing", "Evening camp"];
// The lines a player draws as page text.
export const DRAWN_LINES = [
  "The river was high that spring.",
  "We waited two days to cross.",
  "Then the water went down.",
];

// A player whose controls (icons named by aria-label) show a tooltip over
// the video while pointed at: a plain div with the control's name, as many
// players draw them, in one place above them; its seek bar shows the name
// of the chapter pointed at there. With `captions`, it also draws its captions as page
// text. `window.showTip(text)` shows the tooltip without the pointer.
const tooltipPage = ({ captions = false } = {}) =>
  `<!doctype html><html lang="en"><head><title>Player with tooltips</title>${STYLE}
<style>#bar button{width:40px;height:32px;margin-right:8px}#bar i{display:block;width:16px;height:16px;margin:auto;background:#fff}</style></head><body>
<div id="player" style="position:relative;width:640px;height:360px">
${VIDEO_TAG.replace('style="', 'autoplay loop style="')}></video>
<div id="captions" style="position:absolute;left:0;right:0;bottom:120px;text-align:center"><span id="caption-line" style="background:#000;color:#fff"></span></div>
<div id="tip" style="position:absolute;left:8px;bottom:56px;padding:2px 6px;background:#222;color:#fff;display:none"></div>
<div id="seek" role="slider" aria-label="Seek" aria-valuenow="0" style="position:absolute;left:8px;right:8px;bottom:44px;height:8px;display:flex">${CHAPTERS.map((_, index) => `<div id="chapter-${index}" style="flex:1;margin-right:2px;background:#888"></div>`).join("")}</div>
<div id="bar" style="position:absolute;left:8px;bottom:8px">${CONTROL_LABELS.map((label, index) => `<button id="control-${index}" aria-label="${label}"><i></i></button>`).join("")}</div>
</div>
<script>
const video = document.getElementById("video");
const tip = document.getElementById("tip");
window.showTip = (text) => { tip.textContent = text; tip.style.display = "block"; };
for (const button of document.querySelectorAll("#bar button")) {
  button.addEventListener("pointerenter", () => window.showTip(button.getAttribute("aria-label")));
  button.addEventListener("pointerleave", () => { tip.style.display = "none"; });
}
const chapters = ${JSON.stringify(CHAPTERS)};
chapters.forEach((name, index) => document.getElementById("chapter-" + index).addEventListener("pointerenter", () => window.showTip(name)));
document.getElementById("seek").addEventListener("pointerleave", () => { tip.style.display = "none"; });
if (${captions}) {
  const lines = ${JSON.stringify(DRAWN_LINES)};
  let index = 0;
  setInterval(() => {
    if (!video.paused) document.getElementById("caption-line").textContent = lines[index++ % lines.length];
  }, 700);
}
</script>
</body></html>`;

export const PAGES = {
  ...rollingPages(VIDEO_TAG, STYLE),
  "/blank.webm": { html: video, headers: { "Content-Type": "video/webm" } },
  "/frames.webm": { html: frames, headers: { "Content-Type": "video/webm" } },
  "/captions.vtt": { html: vtt, headers: { "Content-Type": "text/vtt" } },
  // Served as plain text, as such players often get it.
  "/api/captions": {
    html: json3,
    headers: { "Content-Type": "application/json" },
  },
  // A <track> the browser reads.
  "/track": `<!doctype html><html lang="en"><head><title>A track video</title>${STYLE}</head><body>
${VIDEO_TAG}><track id="track" kind="subtitles" srclang="en" label="English" src="/captions.vtt" default></video>
</body></html>`,
  // A <track> over a bright frame, then a dark one.
  "/frames": `<!doctype html><html lang="en"><head><title>Bright and dark</title>${STYLE}</head><body>
${VIDEO_TAG.replace("/blank.webm", "/frames.webm")}><track kind="subtitles" srclang="en" label="English" src="/captions.vtt" default></video>
</body></html>`,
  // A player that adds its cues while the video plays, like HLS players.
  "/streamed": `<!doctype html><html lang="en"><head><title>Streamed cues</title>${STYLE}</head><body>
${VIDEO_TAG}></video>
<script>
const track = document.getElementById("video").addTextTrack("subtitles", "English", "en");
track.mode = "showing";
let next = 0;
const add = () => { track.addCue(new VTTCue(next * 5, next * 5 + 4, "Streamed line " + next + ".")); next++; };
add(); add();
const timer = setInterval(() => { add(); if (next >= 40) clearInterval(timer); }, 150);
</script>
</body></html>`,
  // A player that draws its captions as page text over the video, with a
  // time display and a control that must not count as captions.
  "/drawn": `<!doctype html><html lang="en"><head><title>Drawn captions</title>${STYLE}</head><body>
<div id="player" style="position:relative;width:640px;height:360px">
${VIDEO_TAG.replace('style="', 'autoplay loop style="')}></video>
<div id="captions" style="position:absolute;left:0;right:0;bottom:40px;text-align:center"><span id="caption-line" style="background:#000;color:#fff"></span></div>
<div style="position:absolute;left:8px;bottom:8px;color:#fff"><span id="time">0:00</span> <button id="pause">Pause</button></div>
</div>
<script>
const video = document.getElementById("video");
const lines = ["The river was high that spring.", "We waited two days to cross.", "Then the water went down."];
let index = 0;
setInterval(() => {
  document.getElementById("time").textContent = "0:" + String(Math.floor(video.currentTime)).padStart(2, "0");
  if (!video.paused) document.getElementById("caption-line").textContent = lines[index++ % lines.length];
}, 700);
</script>
</body></html>`,
  "/danmaku": danmakuPage(),
  "/danmaku-pool": danmakuPage({ pool: true }),
  "/danmaku-track": danmakuPage({ track: true }),
  "/tooltips": tooltipPage(),
  "/tooltips-captions": tooltipPage({ captions: true }),
  // A player that loads its own caption file when its CC button is pressed
  // (after the user started translating), and draws nothing we can read.
  "/stub-later": `<!doctype html><html lang="en"><head><title>Stub player</title>${STYLE}</head><body>
${VIDEO_TAG}></video>
<button id="cc" onclick="const r = new XMLHttpRequest(); r.open('GET', '/api/captions?fmt=json3&lang=en'); r.onload = () => { window.loaded = JSON.parse(r.responseText).events.length; }; r.send();">CC</button>
</body></html>`,
  // A player that loads its caption file as the page starts, before anyone
  // could do anything.
  "/stub-start": `<!doctype html><html lang="en"><head><title>Stub player</title>${STYLE}</head><body>
${VIDEO_TAG}></video>
<script>const r = new XMLHttpRequest(); r.open('GET', '/api/captions?fmt=json3&lang=en&start'); r.onload = () => { window.loaded = JSON.parse(r.responseText).events.length; }; r.send();</script>
</body></html>`,
  // A player that clips a video larger than itself and offset in it, and
  // lays itself out again a moment after the window changes size, on a
  // page that scrolls.
  "/clipped": `<!doctype html><html lang="en"><head><title>Clipped player</title>${STYLE}</head><body>
<div id="player" style="position:relative;overflow:hidden;background:#000">
<video id="video" src="/blank.webm" muted playsinline loop preload="auto" style="position:absolute;left:0;top:12%;width:115%;height:115%"><track kind="subtitles" srclang="en" label="English" src="/captions.vtt" default></video>
</div>
<p>The video's title, under the player.</p>
<div style="height:2000px"></div>
<script>
const player = document.getElementById("player");
const layout = () => {
  const width = Math.round(innerWidth * 0.6);
  player.style.width = width + "px";
  player.style.height = Math.round((width * 9) / 16) + "px";
};
layout();
let timer;
addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(layout, 250); });
</script>
</body></html>`,
  // A page that embeds a player from another site. The player fetches its
  // caption file and its thumbnail track as the page starts, both served as
  // plain bytes, and draws the lines itself.
  "/embed": `<!doctype html><html lang="en"><head><title>Embedded player</title>${STYLE}</head><body>
<iframe id="frame" style="display:block;width:680px;height:400px;border:0"></iframe>
<script>frame.src = location.href.replace("127.0.0.1", "localhost").replace("/embed", "/embedded-player");</script>
</body></html>`,
  "/embedded-player": `<!doctype html><html lang="en"><head><title>Player</title>${STYLE}</head><body>
<div id="player" style="position:relative;width:640px;height:360px">
${VIDEO_TAG.replace('style="display:block;width:640px;height:360px"', 'style="display:block;width:100%;height:100%"')}></video>
<div id="text-container" style="position:absolute;left:0;right:0;bottom:30px;text-align:center;color:#fff"></div>
</div>
<script>
const seconds = (clock) => clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);
(async () => {
  const text = await (await fetch("/cdn/track-en")).text();
  const cues = text.split("\\n\\n").flatMap((block) => {
    const match = /^(\\S+) --> (\\S+)[^\\n]*\\n([\\s\\S]+)$/.exec(block);
    return match ? [{ start: seconds(match[1]), end: seconds(match[2]), text: match[3] }] : [];
  });
  await (await fetch("/cdn/preview-thumbs")).text();
  const video = document.getElementById("video");
  const container = document.getElementById("text-container");
  const draw = () => {
    const cue = cues.find((cue) => cue.start <= video.currentTime && video.currentTime < cue.end);
    container.innerHTML = cue ? cue.text : "";
  };
  video.addEventListener("timeupdate", draw);
  video.addEventListener("seeked", draw);
  window.loaded = cues.length;
})();
</script>
</body></html>`,
  "/cdn/track-en": { html: watermarked, headers: UNNAMED },
  "/cdn/preview-thumbs": { html: thumbnails, headers: UNNAMED },
  // The same player that loaded its file before the user started.
  "/stub-earlier": `<!doctype html><html lang="en"><head><title>Stub player</title>${STYLE}</head><body>
${VIDEO_TAG}></video>
<script>fetch("/api/captions?fmt=json3&lang=en").then((r) => r.json()).then((d) => { window.loaded = d.events.length; });</script>
</body></html>`,
};

// The extension with the fixture model translating (every line comes back
// as "FR: <line>"); `batches` gets each request's lines. `pages` adds to
// the fixture's pages.
export async function startSubtitles({ answer, preferences, pages } = {}) {
  const session = await startPageTranslate({
    pages: { ...PAGES, ...pages },
    answer,
    preferences,
  });
  const { worker } = session;
  return {
    ...session,
    // A right-click menu item clicked on the tab showing `url`.
    clickMenuItem: async (menuItemId, url, extra = {}) => {
      const tabId = await poll(() =>
        worker.call(
          async (url) => (await chrome.tabs.query({ url }))[0]?.id,
          url,
        ),
      );
      await worker.call(
        async ({ tabId, menuItemId, parentMenuItemId, extra }) => {
          const tab = await chrome.tabs.get(tabId);
          chrome.contextMenus.onClicked.dispatch(
            {
              menuItemId,
              parentMenuItemId,
              editable: false,
              frameId: 0,
              pageUrl: tab.url,
              ...extra,
            },
            tab,
          );
        },
        { tabId, menuItemId, parentMenuItemId: CONTEXT_MENU_ID.parent, extra },
      );
    },
  };
}

// The subtitle layer's lines: `{ original, translation }`, or null where
// none shows.
export function subtitles(page) {
  return inShadowRoot(page, isLayerRoot, (root) => {
    const layer = root?.querySelector(".layer");
    if (!layer || layer.hidden) return null;
    return {
      original: layer.querySelector(".original").textContent,
      translation: layer.querySelector(".translation").textContent,
    };
  });
}

// The subtitle layer's shadow root (a CDP DOM node).
export function isLayerRoot(root) {
  return (
    root.shadowRootType === "closed" &&
    root.children?.some((child) => hasClass(child, "layer"))
  );
}

// Waits until the layer shows `original` with its translation.
export function shownLine(page, original) {
  return poll(async () => {
    const shown = await subtitles(page);
    return shown?.original === original && shown.translation ? shown : null;
  });
}

// The subtitle layer's box in the viewport, or null where none shows.
export function layerBox(page) {
  return inShadowRoot(page, isLayerRoot, (root) => {
    const layer = root?.querySelector(".layer");
    if (!layer || layer.hidden) return null;
    const { left, top, right, bottom } = layer.getBoundingClientRect();
    return { left, top, right, bottom };
  });
}

// Scrolls the page by `y` and, in the same task (before any frame), gives
// the layer's box and the box of the element `id`.
export function scrollAndMeasure(page, y, id = "player") {
  return inShadowRoot(
    page,
    isLayerRoot,
    (root, { y, id }) => {
      scrollBy(0, y);
      const box = (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      return {
        layer: box(root.querySelector(".layer")),
        player: box(document.getElementById(id)),
      };
    },
    { y, id },
  );
}

// Whether the page's caption observer wraps XMLHttpRequest.
export function hasCaptionObserver(page) {
  return page.call(
    () => !String(XMLHttpRequest.prototype.send).includes("native code"),
  );
}

// Whether the page's bullet comments are all shown as the page drew them
// (none hidden), and no line sent for translation came from one.
export async function commentsUntouched(page, batches) {
  const shown = await page.call(() =>
    [...document.querySelectorAll("#comments, #comments *")].every(
      (element) => getComputedStyle(element).opacity !== "0",
    ),
  );
  const sent = batches
    .flat()
    .some((line) => COMMENTS.some((comment) => line.includes(comment)));
  return shown && !sent;
}

export function seek(page, seconds) {
  return page.call(
    (seconds) =>
      new Promise((resolve) => {
        const video = document.getElementById("video");
        video.addEventListener("seeked", () => resolve(true), { once: true });
        video.currentTime = seconds;
      }),
    seconds,
  );
}
