// A player like those of sites with automatic captions: it loads a json3
// caption file whose words are timed, and draws its own captions from it
// as page text, rolling (the words show as they are said, under the line
// before), rebuilding the box of each line as the next one starts. Over its
// video it also shows a chapter title and, while a control is pointed at,
// a tooltip: neither is captions.

// Every five seconds a line of seven words, half a second apart.
export const ROLLING_WORDS = (seconds) => [
  "Rolling",
  "words",
  "at",
  String(seconds),
  "seconds",
  "said",
  "slowly.",
];
export const WORD_SECONDS = 0.5;
export const rollingLine = (seconds) => ROLLING_WORDS(seconds).join(" ");
export const CHAPTER_TITLE = "Chapter two: crossing the river";
export const TIP_LABEL = "Settings";

const times = Array.from({ length: 40 }, (_, i) => i * 5);
const json3 = JSON.stringify({
  events: times.map((t) => ({
    tStartMs: t * 1000,
    dDurationMs: 4000,
    segs: ROLLING_WORDS(t).map((word, index) => ({
      utf8: index ? ` ${word}` : word,
      tOffsetMs: index * WORD_SECONDS * 1000,
    })),
  })),
});

const page = (videoTag, style) => `<!doctype html><html lang="en">
<head><title>Rolling player</title>${style}</head><body>
<div id="player" style="position:relative;width:640px;height:360px">
${videoTag}></video>
<div id="cc-area" style="position:absolute;left:0;right:0;bottom:48px;text-align:center;color:#fff"></div>
<div id="chapter" style="position:absolute;left:8px;top:8px;color:#fff">${CHAPTER_TITLE}</div>
<div id="tip" style="position:absolute;right:8px;bottom:44px;padding:2px 6px;background:#222;color:#fff;display:none"></div>
<button id="settings" aria-label="${TIP_LABEL}" style="position:absolute;right:8px;bottom:8px;width:40px;height:32px"></button>
</div>
<script>
const video = document.getElementById("video");
const area = document.getElementById("cc-area");
const tip = document.getElementById("tip");
const settings = document.getElementById("settings");
settings.addEventListener("pointerenter", () => { tip.textContent = settings.getAttribute("aria-label"); tip.style.display = "block"; });
settings.addEventListener("pointerleave", () => { tip.style.display = "none"; });
window.showTip = () => { tip.textContent = ${JSON.stringify(TIP_LABEL)}; tip.style.display = "block"; };
let events = [];
let shown = "";
let index = -1;
const said = (event, now) => event.segs.filter((seg) => (event.tStartMs + seg.tOffsetMs) / 1000 <= now).map((seg) => seg.utf8).join("");
const draw = () => {
  const now = video.currentTime;
  const at = events.findIndex((event) => event.tStartMs / 1000 <= now && now < (event.tStartMs + event.dDurationMs) / 1000);
  const before = at > 0 ? said(events[at - 1], Infinity) : "";
  const text = at < 0 ? "" : before + "\\n" + said(events[at], now);
  if (at === index && text === shown) return;
  if (at !== index) {
    // A new box for each line.
    area.replaceChildren();
    index = at;
  }
  shown = text;
  if (at < 0) return;
  let box = area.firstElementChild;
  if (!box) {
    box = document.createElement("div");
    area.append(box);
  }
  box.replaceChildren(...text.split("\\n").map((line) => {
    const item = document.createElement("span");
    item.style.cssText = "display:block;background:#000";
    item.textContent = line;
    return item;
  }));
};
const loop = () => { draw(); requestAnimationFrame(loop); };
fetch("/api/rolling-captions?fmt=json3&lang=en").then((r) => r.json()).then((data) => {
  events = data.events;
  window.loaded = events.length;
  loop();
});
</script>
</body></html>`;

export const rollingPages = (videoTag, style) => ({
  "/api/rolling-captions": {
    html: json3,
    headers: { "Content-Type": "application/json" },
  },
  "/rolling": page(videoTag, style),
});
