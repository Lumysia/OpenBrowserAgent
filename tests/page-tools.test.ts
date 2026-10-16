import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import { applyPageToolSetting, pageToolsState } from "../src/shared/page-tools";
import type { Preferences } from "../src/shared/types";

const state = (
  preferences: Partial<Preferences> = {},
  change: Partial<Parameters<typeof pageToolsState>[0]> = {},
) =>
  pageToolsState({
    host: "news.example.com",
    preferences: mergePreferences(preferences),
    translated: false,
    video: false,
    subtitles: false,
    ...change,
  });

test("page tools: the defaults on a web page, nothing on other pages", () => {
  assert.deepEqual(state(), {
    host: "news.example.com",
    translated: false,
    smartBar: false,
    video: false,
    subtitles: false,
  });
  const none = state({}, { host: undefined, translated: true, video: true });
  assert.equal(none.translated, false);
  assert.equal(none.video, false);
});

test("page tools: the smart bar switch writes the existing site lists", () => {
  const host = "news.example.com";
  const preferences = mergePreferences({});
  // The smart bar, off everywhere: on for this site only.
  const smart = applyPageToolSetting(preferences, host, {
    tool: "smartBar",
    on: true,
  })!;
  assert.equal(smart.smartBar?.enabled, true);
  assert.equal(smart.smartBar?.siteMode, "allowList");
  assert.deepEqual(smart.smartBar?.allowedHosts, [host]);
  assert.equal(state(smart).smartBar, true);
  assert.equal(state(smart, { host: "other.org" }).smartBar, false);
  // On everywhere but blocked here: unblocked; off again: blocked.
  const blocked = mergePreferences({
    smartBar: {
      ...smart.smartBar!,
      siteMode: "blockList",
      blockedHosts: [host],
    },
  });
  const unblocked = applyPageToolSetting(blocked, host, {
    tool: "smartBar",
    on: true,
  })!;
  assert.deepEqual(unblocked.smartBar?.blockedHosts, []);
  assert.deepEqual(
    applyPageToolSetting(unblocked, host, { tool: "smartBar", on: false })!
      .smartBar?.blockedHosts,
    [host],
  );

  // Actions on the page change no settings.
  assert.equal(
    applyPageToolSetting(preferences, host, { tool: "translate" }),
    undefined,
  );
  assert.equal(
    applyPageToolSetting(preferences, undefined, {
      tool: "smartBar",
      on: true,
    }),
    undefined,
  );
});
