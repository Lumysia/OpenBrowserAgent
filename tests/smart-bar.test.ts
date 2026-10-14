import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import {
  DEFAULT_SMART_BAR_SETTINGS,
  hideSmartBarOnHost,
  isSmartBarAllowedOnHost,
  normalizeHost,
  normalizeSmartBarSettings,
  SMART_BAR_MAX_TEXT_CHARS,
  smartBarActions,
  smartBarHideSite,
  smartBarMatchPatterns,
  smartBarPatternsCover,
  smartBarTextTooLong,
} from "../src/shared/smart-bar";
import { smartBarPrompt } from "../src/background/smart-bar/prompts";
import { placeSmartBar } from "../src/smart-bar/placement";
import { speechChunks } from "../src/shared/speech-language";

test("the smart bar is off by default and stored settings are cleaned", () => {
  assert.equal(mergePreferences({}).smartBar?.enabled, false);
  assert.deepEqual(
    normalizeSmartBarSettings({
      enabled: true,
      trigger: "sometimes" as never,
      blockedHosts: ["https://Example.com/path", "example.com", "not a host"],
      disabledPageActions: ["copy", "unknown" as never],
    }),
    {
      ...DEFAULT_SMART_BAR_SETTINGS,
      enabled: true,
      blockedHosts: ["example.com"],
      disabledPageActions: ["copy"],
    },
  );
  assert.equal(normalizeHost("*.Sub.Example.org."), "sub.example.org");
});

test("site rules: a listed site covers subdomains; both lists survive a mode switch", () => {
  // No site is blocked by default.
  assert.deepEqual(DEFAULT_SMART_BAR_SETTINGS.blockedHosts, []);
  const settings = {
    ...DEFAULT_SMART_BAR_SETTINGS,
    enabled: true,
    blockedHosts: ["docs.example.com"],
  };
  assert.equal(isSmartBarAllowedOnHost(settings, "docs.example.com"), false);
  assert.equal(isSmartBarAllowedOnHost(settings, "a.docs.example.com"), false);
  assert.equal(isSmartBarAllowedOnHost(settings, "example.com"), true);

  const hidden = hideSmartBarOnHost(settings, "news.example");
  assert.deepEqual(hidden.blockedHosts, ["docs.example.com", "news.example"]);

  const allow = {
    ...hidden,
    siteMode: "allowList" as const,
    allowedHosts: ["example.org"],
  };
  assert.equal(isSmartBarAllowedOnHost(allow, "www.example.org"), true);
  assert.equal(isSmartBarAllowedOnHost(allow, "example.com"), false);
  const hiddenInAllow = hideSmartBarOnHost(allow, "www.example.org");
  assert.deepEqual(hiddenInAllow.allowedHosts, []);
  // The bar's menu names what that hides: the whole listed domain.
  assert.equal(smartBarHideSite(allow, "www.example.org"), "example.org");
  assert.equal(smartBarHideSite(hidden, "www.example.org"), "www.example.org");
  assert.deepEqual(hiddenInAllow.blockedHosts, hidden.blockedHosts);
});

test("the page script is registered only where the bar may run", () => {
  assert.equal(smartBarMatchPatterns(DEFAULT_SMART_BAR_SETTINGS), undefined);
  const on = {
    ...DEFAULT_SMART_BAR_SETTINGS,
    enabled: true,
    blockedHosts: ["docs.example.com"],
  };
  assert.deepEqual(smartBarMatchPatterns(on), {
    matches: ["http://*/*", "https://*/*"],
    excludeMatches: ["*://*.docs.example.com/*"],
  });
  assert.equal(
    smartBarMatchPatterns({ ...on, siteMode: "allowList" }),
    undefined,
  );
  assert.deepEqual(
    smartBarMatchPatterns({
      ...on,
      siteMode: "allowList",
      allowedHosts: ["example.org"],
    })?.matches,
    ["*://*.example.org/*"],
  );
  const blockMode = smartBarMatchPatterns(on)!;
  assert.equal(smartBarPatternsCover(blockMode, "example.org"), true);
  assert.equal(smartBarPatternsCover(blockMode, "a.docs.example.com"), false);
  assert.deepEqual(
    smartBarActions({ ...on, disabledEditActions: ["translate"] }, true),
    ["improve", "fixGrammar", "ask"],
  );
});

test("the bar goes below the selection, flips above and stays in view", () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 200, height: 40 };
  const below = placeSmartBar({
    anchor: { left: 100, right: 300, top: 100, bottom: 120 },
    x: 150,
    size,
    viewport,
  });
  // It grows from the selection: below it, from the mouse's x.
  assert.deepEqual(below, {
    left: 50,
    top: 128,
    side: "below",
    originX: 100,
    offscreen: false,
  });
  const above = placeSmartBar({
    anchor: { left: 700, right: 790, top: 560, bottom: 580 },
    size,
    viewport,
  });
  assert.deepEqual(above, {
    left: 592,
    top: 512,
    side: "above",
    originX: 153,
    offscreen: false,
  });
  assert.equal(
    placeSmartBar({
      anchor: { left: 0, right: 10, top: -80, bottom: -60 },
      size,
      viewport,
    }).offscreen,
    true,
  );
});

test("long selections are refused, never cut", () => {
  const limit = "x".repeat(SMART_BAR_MAX_TEXT_CHARS);
  assert.equal(smartBarTextTooLong(limit), false);
  assert.equal(smartBarTextTooLong(`${limit}TAIL`), true);
  // What the model gets is the whole selection, so Replace is safe.
  assert.match(
    smartBarPrompt("improve", `${limit}TAIL`, "en-US").prompt,
    /TAIL\n<\/text>$/,
  );
});

test("text is read aloud in sentence-sized pieces, all of it", () => {
  assert.deepEqual(speechChunks("One. Two? Three!", 8), [
    "One.",
    "Two?",
    "Three!",
  ]);
  assert.deepEqual(speechChunks("你好。再见！", 200), ["你好。 再见！"]);
  const long = "x".repeat(450);
  const chunks = speechChunks(`${long}. End.`, 200);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
  assert.equal(chunks.join("").replace(/ /g, ""), `${long}.End.`);
  assert.deepEqual(speechChunks("   "), []);
});

test("context helps read the selection but is never the task", () => {
  const { prompt } = smartBarPrompt("explain", "Top st", "en-US", {
    before: "News ",
    after: "ories > Local",
    pageTitle: "Google News",
  });
  assert.match(
    prompt,
    /Page title: Google News\nNews \[\[SELECTION\]\]ories > Local/,
  );
  // The selected text stays last and alone in its own block.
  assert.match(prompt, /<\/context>\n\n<text>\nTop st\n<\/text>$/);
  assert.match(prompt, /read it as the whole word/);
  // Edits replace the selection: they must not complete the cut-off word.
  const fix = smartBarPrompt("fixGrammar", "Top st", "en-US", {
    before: "",
    after: "ories",
  }).prompt;
  assert.match(fix, /replaces exactly the selected text/);
  assert.doesNotMatch(fix, /read it as the whole word/);
  // Nothing to add, no context block.
  assert.doesNotMatch(
    smartBarPrompt("explain", "x", "en-US", { before: " ", after: "" }).prompt,
    /<context>/,
  );
  // Whatever a message claims, context is bounded.
  const long = smartBarPrompt("explain", "x", "en-US", {
    before: "b".repeat(5000),
    after: "a".repeat(5000),
  }).prompt;
  assert.ok(long.length < 2000);
});
