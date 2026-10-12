import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import {
  DEFAULT_SMART_BAR_SETTINGS,
  hideSmartBarOnHost,
  isSmartBarAllowedOnHost,
  normalizeHost,
  normalizeSmartBarSettings,
  smartBarActions,
  smartBarMatchPatterns,
} from "../src/shared/smart-bar";
import { placeSmartBar } from "../src/smart-bar/placement";

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
  const settings = { ...DEFAULT_SMART_BAR_SETTINGS, enabled: true };
  assert.equal(isSmartBarAllowedOnHost(settings, "docs.google.com"), false);
  assert.equal(isSmartBarAllowedOnHost(settings, "a.docs.google.com"), false);
  assert.equal(isSmartBarAllowedOnHost(settings, "google.com"), true);

  const hidden = hideSmartBarOnHost(settings, "news.example");
  assert.deepEqual(hidden.blockedHosts, ["docs.google.com", "news.example"]);

  const allow = {
    ...hidden,
    siteMode: "allowList" as const,
    allowedHosts: ["example.org"],
  };
  assert.equal(isSmartBarAllowedOnHost(allow, "www.example.org"), true);
  assert.equal(isSmartBarAllowedOnHost(allow, "google.com"), false);
  const hiddenInAllow = hideSmartBarOnHost(allow, "www.example.org");
  assert.deepEqual(hiddenInAllow.allowedHosts, []);
  assert.deepEqual(hiddenInAllow.blockedHosts, hidden.blockedHosts);
});

test("the page script is registered only where the bar may run", () => {
  assert.equal(smartBarMatchPatterns(DEFAULT_SMART_BAR_SETTINGS), undefined);
  const on = { ...DEFAULT_SMART_BAR_SETTINGS, enabled: true };
  assert.deepEqual(smartBarMatchPatterns(on), {
    matches: ["http://*/*", "https://*/*"],
    excludeMatches: ["*://*.docs.google.com/*"],
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
  assert.deepEqual(below, { left: 50, top: 128, offscreen: false });
  const above = placeSmartBar({
    anchor: { left: 700, right: 790, top: 560, bottom: 580 },
    size,
    viewport,
  });
  assert.deepEqual(above, { left: 592, top: 512, offscreen: false });
  assert.equal(
    placeSmartBar({
      anchor: { left: 0, right: 10, top: -80, bottom: -60 },
      size,
      viewport,
    }).offscreen,
    true,
  );
});
