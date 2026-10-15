import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslateMode } from "../src/background/page-translate/translate-mode";
import { memoryArea } from "./fake-chrome";

// A tab's translate mode with session storage in memory; `translated` lists
// the tabs it asked to translate, in order.
function setup(area = memoryArea()) {
  const translated: number[] = [];
  const mode = createTranslateMode({
    area,
    translate: async (tabId) => void translated.push(tabId),
  });
  // A page in tab `tabId` is parsed after a navigation of `transitionType`.
  const navigate = async (tabId: number, transitionType = "link") => {
    await mode.committed({ tabId, frameId: 0, transitionType });
    await mode.ready(tabId);
  };
  return { area, mode, translated, navigate };
}

test("a tab's later pages are translated after the user translates one", async () => {
  const { mode, translated, navigate } = setup();
  await navigate(1);
  assert.deepEqual(translated, []);
  await mode.set(1, true);
  for (const type of ["link", "typed", "auto_bookmark", "form_submit"])
    await navigate(1, type);
  // A same-document navigation reports no new commit.
  await mode.ready(1);
  assert.deepEqual(translated, [1, 1, 1, 1, 1]);
  // Other tabs, and frames inside the page, are not affected.
  await navigate(2);
  await mode.committed({ tabId: 1, frameId: 3, transitionType: "reload" });
  await mode.ready(1, 3);
  assert.deepEqual(translated, [1, 1, 1, 1, 1]);
  assert.equal(await mode.isOn(1), true);
  assert.equal(await mode.isOn(2), false);
});

test("a reload ends the mode", async () => {
  const { mode, translated, navigate } = setup();
  await mode.set(1, true);
  await navigate(1, "reload");
  assert.deepEqual(translated, []);
  assert.equal(await mode.isOn(1), false);
  await navigate(1);
  assert.deepEqual(translated, []);
});

test("without transition types the mode stays until Show original", async () => {
  const { mode, translated } = setup();
  await mode.set(1, true);
  await mode.committed({ tabId: 1, frameId: 0 });
  await mode.ready(1);
  assert.deepEqual(translated, [1]);
  assert.equal(await mode.isOn(1), true);
});

test("Show original ends the mode", async () => {
  const { mode, translated, navigate } = setup();
  await mode.set(1, true);
  await mode.set(1, false);
  await navigate(1);
  assert.deepEqual(translated, []);
});

test("closing the tab removes it from storage", async () => {
  const { area, mode } = setup();
  await mode.set(1, true);
  await mode.set(2, true);
  assert.deepEqual(Object.values(area.data), [[1, 2]]);
  await mode.removed(1);
  assert.deepEqual(Object.values(area.data), [[2]]);
  assert.equal(await mode.isOn(1), false);
});

test("a tab the browser swaps in keeps the mode", async () => {
  const { mode, translated } = setup();
  await mode.set(1, true);
  await mode.replaced(5, 1);
  assert.deepEqual(translated, [5]);
  assert.equal(await mode.isOn(1), false);
  assert.equal(await mode.isOn(5), true);
});

test("a tab opened from a translated page starts translated", async () => {
  const { mode, translated, navigate } = setup();
  await mode.set(1, true);
  await mode.opened(7, 1);
  await navigate(7);
  assert.deepEqual(translated, [7]);
  // From there on it is its own tab: further tabs it opens follow it too.
  await mode.opened(8, 7);
  assert.equal(await mode.isOn(8), true);
  // A tab opened from an untranslated page does not.
  await mode.opened(9, 2);
  await navigate(9);
  assert.deepEqual(translated, [7]);
  assert.equal(await mode.isOn(9), false);
});

test("a restarted service worker keeps the mode", async () => {
  const first = setup();
  await first.mode.set(1, true);
  const restarted = setup(first.area);
  await restarted.navigate(1);
  assert.deepEqual(restarted.translated, [1]);
  await restarted.navigate(1, "reload");
  assert.equal(await setup(first.area).mode.isOn(1), false);
});

test("events are handled in the order they came", async () => {
  const { mode, translated } = setup();
  void mode.set(1, true);
  void mode.committed({ tabId: 1, frameId: 0, transitionType: "reload" });
  await mode.ready(1);
  assert.deepEqual(translated, []);
});
