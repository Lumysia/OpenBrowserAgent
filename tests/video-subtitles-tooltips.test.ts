import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import {
  controlChain,
  labelsOf,
  repeatsLabel,
} from "../src/video-subtitles/sources/pointed-controls";

test("a tooltip repeats a control's name, maybe with a key or shortened", () => {
  assert.ok(repeatsLabel("Mute (m)", ["Mute (m)"]));
  assert.ok(repeatsLabel("Mute (m)", ["Mute"]));
  assert.ok(repeatsLabel("Settings", ["Open settings"]));
  assert.ok(repeatsLabel("  full\nScreen ", ["Full screen"]));
  assert.ok(repeatsLabel("Lautstärke", ["", "Lautstärke"]));
  // Captions that only mention it, or say something else.
  assert.ok(!repeatsLabel("Can you mute the radio over there?", ["Mute"]));
  assert.ok(!repeatsLabel("We waited two days to cross.", ["Play", "Mute"]));
  // No words: times and numbers.
  assert.ok(!repeatsLabel("1:23", ["1:23"]));
  assert.ok(!repeatsLabel("Play", []));
});

const page = (html: string) => {
  const { document } = parseHTML(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  const get = (id: string) => document.getElementById(id)!;
  return { get };
};

test("the control pointed at: the nearest named or interactive element in the player", () => {
  const { get } = page(`
    <div id="player" aria-label="Video player">
      <div id="frame"><video id="video"></video></div>
      <div id="bar">
        <button id="mute" aria-label="Mute (m)" data-title-no-tooltip="Mute"><svg id="icon"></svg></button>
        <div id="cc" data-tooltip="Subtitles"><span id="cc-icon"></span></div>
        <div id="seek" role="slider" aria-label="Seek" aria-describedby="seek-tip"><div id="chapter"></div></div>
        <button id="next"><span id="next-text">Next video</span></button>
        <span id="plain">plain</span>
      </div>
      <div id="seek-tip">Into the valley</div>
    </div>`);
  const player = get("player");
  const video = get("video");
  const ids = (chain: Element[]) => chain.map((element) => element.id);
  assert.deepEqual(ids(controlChain(get("icon"), player, video)), [
    "icon",
    "mute",
  ]);
  assert.deepEqual(ids(controlChain(get("cc-icon"), player, video)), [
    "cc-icon",
    "cc",
  ]);
  // Not a control, the video's wrappers, or the player itself.
  assert.deepEqual(controlChain(get("plain"), player, video), []);
  assert.deepEqual(controlChain(get("frame"), player, video), []);
  assert.deepEqual(controlChain(player, player, video), []);

  assert.deepEqual(labelsOf(controlChain(get("icon"), player, video)), [
    "Mute (m)",
    "Mute",
    "",
  ]);
  assert.deepEqual(labelsOf(controlChain(get("cc-icon"), player, video)), [
    "Subtitles",
    "",
  ]);
  // What a control refers to as its description, and its own text.
  assert.ok(
    labelsOf(controlChain(get("chapter"), player, video)).includes(
      "Into the valley",
    ),
  );
  assert.ok(
    labelsOf(controlChain(get("next-text"), player, video)).includes(
      "Next video",
    ),
  );
});
