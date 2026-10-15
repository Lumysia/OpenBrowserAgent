import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import {
  DEFAULT_PAGE_BUTTON_POSITION,
  normalizePageButtonPosition,
  pageTranslateShared,
  setPageTranslateShared,
} from "../src/shared/page-translate/button";
import {
  DEFAULT_PAGE_TRANSLATE_SETTINGS,
  hidePageButtonOnHost,
  isPageButtonShownOn,
  normalizePageTranslateSettings,
  pageButtonMatchPatterns,
  type PageTranslateSettings,
} from "../src/shared/page-translate/settings";
import { patternsCover } from "../src/shared/site-hosts";

test("the page button and the shortcut are on by default, also for settings stored before them", () => {
  assert.equal(DEFAULT_PAGE_TRANSLATE_SETTINGS.pageButton, true);
  assert.equal(DEFAULT_PAGE_TRANSLATE_SETTINGS.shortcut, true);
  assert.deepEqual(DEFAULT_PAGE_TRANSLATE_SETTINGS.pageButtonHiddenHosts, []);
  // Written by an earlier release: no button, site list or shortcut fields.
  const stored = {
    engine: "google",
    modelId: "",
    targetLanguage: "de",
    display: "translation",
    translateMenus: true,
  } as const;
  const settings = mergePreferences({
    pageTranslate: stored as unknown as PageTranslateSettings,
  }).pageTranslate!;
  assert.deepEqual(settings, {
    ...stored,
    videoSubtitles: false,
    pageButton: true,
    pageButtonHiddenHosts: [],
    shortcut: true,
  });
  // Turned off stays off.
  const off = normalizePageTranslateSettings({
    pageButton: false,
    shortcut: false,
  });
  assert.equal(off.pageButton, false);
  assert.equal(off.shortcut, false);
  assert.equal(
    normalizePageTranslateSettings({ pageButton: "no" as never }).pageButton,
    true,
  );
});

test("the page button's site list is cleaned and hides it on each site with its subdomains", () => {
  const settings = normalizePageTranslateSettings({
    pageButtonHiddenHosts: [
      "https://Docs.Example.com/path",
      "docs.example.com",
      "not a host",
    ],
  });
  assert.deepEqual(settings.pageButtonHiddenHosts, ["docs.example.com"]);
  assert.deepEqual(
    normalizePageTranslateSettings({ pageButtonHiddenHosts: "x" as never })
      .pageButtonHiddenHosts,
    [],
  );
  assert.equal(isPageButtonShownOn(settings, "docs.example.com"), false);
  assert.equal(isPageButtonShownOn(settings, "a.docs.example.com"), false);
  assert.equal(isPageButtonShownOn(settings, "example.com"), true);

  const hidden = hidePageButtonOnHost(settings, "news.example");
  assert.deepEqual(hidden.pageButtonHiddenHosts, [
    "docs.example.com",
    "news.example",
  ]);
  // Already hidden there (also through a listed parent domain): unchanged.
  assert.equal(hidePageButtonOnHost(hidden, "news.example"), hidden);
  assert.equal(hidePageButtonOnHost(hidden, "a.docs.example.com"), hidden);
  assert.equal(
    isPageButtonShownOn({ ...hidden, pageButton: false }, "example.com"),
    false,
  );
});

test("the page button's script is registered on every web page but the hidden sites, while it is on", () => {
  const settings = normalizePageTranslateSettings({
    pageButtonHiddenHosts: ["example.org"],
  });
  const patterns = pageButtonMatchPatterns(settings)!;
  assert.deepEqual(patterns, {
    matches: ["http://*/*", "https://*/*"],
    excludeMatches: ["*://*.example.org/*"],
  });
  assert.equal(patternsCover(patterns, "www.example.org"), false);
  assert.equal(patternsCover(patterns, "example.com"), true);
  assert.equal(
    pageButtonMatchPatterns({ ...settings, pageButton: false }),
    undefined,
  );
});

test("the button's place is an edge and a fraction along it", () => {
  assert.deepEqual(DEFAULT_PAGE_BUTTON_POSITION, {
    edge: "right",
    along: 2 / 3,
  });
  for (const stored of [
    undefined,
    0.5,
    { edge: "middle", along: 0.5 },
    { edge: "left", along: Number.NaN },
    { edge: "left", along: "0.5" },
  ])
    assert.deepEqual(
      normalizePageButtonPosition(stored),
      DEFAULT_PAGE_BUTTON_POSITION,
    );
  assert.deepEqual(normalizePageButtonPosition({ edge: "top", along: 0.25 }), {
    edge: "top",
    along: 0.25,
  });
  assert.deepEqual(normalizePageButtonPosition({ edge: "bottom", along: -1 }), {
    edge: "bottom",
    along: 0,
  });
  assert.deepEqual(normalizePageButtonPosition({ edge: "left", along: 3 }), {
    edge: "left",
    along: 1,
  });
});

test("the button hears about each change of the page's translation state once", () => {
  const shared = pageTranslateShared();
  assert.equal(pageTranslateShared(), shared);
  let calls = 0;
  const listener = () => calls++;
  shared.listeners.add(listener);
  setPageTranslateShared({ translated: true, starting: true });
  setPageTranslateShared({ translated: true });
  setPageTranslateShared({ starting: false });
  assert.equal(calls, 2);
  assert.deepEqual(
    { translated: shared.translated, starting: shared.starting },
    { translated: true, starting: false },
  );
  shared.listeners.delete(listener);
});
