import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION_MENU_ID,
  ACTION_MENU_TOP_LEVEL_LIMIT,
  actionMenuChange,
  actionMenuEntries,
} from "../src/shared/action-menu";
import { mergePreferences } from "../src/shared/default-preferences";
import { QUICK_TARGET_LANGUAGES } from "../src/shared/page-translate/languages";
import {
  applyPageToolSetting,
  pageToolsState,
  type PageToolsState,
} from "../src/shared/page-tools";
import type { Preferences } from "../src/shared/types";

const state = (
  preferences: Partial<Preferences> = {},
  change: Partial<Parameters<typeof pageToolsState>[0]> = {},
) =>
  pageToolsState({
    host: "news.example.com",
    preferences: mergePreferences(preferences),
    uiLanguage: "en-US",
    translated: false,
    video: false,
    subtitles: false,
    ...change,
  });

const TITLES = {
  translatePage: "Translate this page",
  showOriginal: "Show original",
  translateInto: "Translate into: {language}",
  followInterface: "Extension's language ({language})",
  pageButton: "Translate button on this site",
  smartBar: "Smart bar on this site",
  subtitles: "Translated subtitles for this video",
};

const entries = (value: PageToolsState) =>
  actionMenuEntries(value, TITLES, {
    contexts: ["action"],
    languageName: (tag) => `<${tag}>`,
    interfaceLanguage: "en",
  });

test("page tools: the defaults on a web page, nothing on other pages", () => {
  assert.deepEqual(state(), {
    host: "news.example.com",
    translated: false,
    targetLanguage: "",
    resolvedTarget: "en",
    pageButton: { on: true, available: true },
    smartBar: false,
    video: false,
    subtitles: false,
  });
  const none = state({}, { host: undefined, translated: true, video: true });
  assert.equal(none.translated, false);
  assert.equal(none.video, false);
  assert.deepEqual(none.pageButton, { on: false, available: false });
});

test("page tools: the site switches write the existing site lists", () => {
  const host = "news.example.com";
  const preferences = mergePreferences({});
  const hidden = applyPageToolSetting(preferences, host, {
    tool: "pageButton",
    on: false,
  })!;
  assert.deepEqual(hidden.pageTranslate?.pageButtonHiddenHosts, [host]);
  assert.equal(state(hidden).pageButton.on, false);
  // Back on: a broader entry covering the site goes too.
  const shown = applyPageToolSetting(
    mergePreferences({
      pageTranslate: {
        ...preferences.pageTranslate!,
        pageButtonHiddenHosts: ["example.com", "other.org"],
      },
    }),
    host,
    { tool: "pageButton", on: true },
  )!;
  assert.deepEqual(shown.pageTranslate?.pageButtonHiddenHosts, ["other.org"]);
  // Off everywhere, the button can't be turned on for one site.
  assert.equal(
    state({
      pageTranslate: { ...preferences.pageTranslate!, pageButton: false },
    }).pageButton.available,
    false,
  );

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

  // "Translate into"; actions on the page change no settings.
  assert.equal(
    applyPageToolSetting(preferences, host, {
      tool: "targetLanguage",
      language: "ja",
    })!.pageTranslate?.targetLanguage,
    "ja",
  );
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

test("the toolbar button's menu: at most 6 items, states from the page", () => {
  const menu = entries(state());
  const top = menu.filter((entry) => !entry.parentId);
  assert.ok(top.length <= ACTION_MENU_TOP_LEVEL_LIMIT);
  assert.deepEqual(
    top.map(({ id }) => id),
    Object.values(ACTION_MENU_ID),
  );
  assert.ok(menu.every((entry) => entry.contexts[0] === "action"));
  const byId = (list: typeof menu, id: string) =>
    list.find((entry) => entry.id === id)!;
  assert.equal(
    byId(menu, ACTION_MENU_ID.translatePage).title,
    TITLES.translatePage,
  );
  assert.equal(
    byId(menu, ACTION_MENU_ID.translateInto).title,
    "Translate into: <en>",
  );
  assert.equal(byId(menu, ACTION_MENU_ID.pageButton).checked, true);
  assert.equal(byId(menu, ACTION_MENU_ID.smartBar).checked, false);
  // Subtitles only with a video.
  assert.equal(byId(menu, ACTION_MENU_ID.subtitles).visible, false);
  const video = entries(state({}, { video: true, subtitles: true }));
  assert.equal(byId(video, ACTION_MENU_ID.subtitles).visible, true);
  assert.equal(byId(video, ACTION_MENU_ID.subtitles).checked, true);
  // A translated page offers the original.
  assert.equal(
    byId(entries(state({}, { translated: true })), ACTION_MENU_ID.translatePage)
      .title,
    TITLES.showOriginal,
  );
  // Languages: the extension's, the quick ones, and the current choice.
  const languages = (list: typeof menu) =>
    list.filter((entry) => entry.parentId === ACTION_MENU_ID.translateInto);
  const choices = languages(menu);
  assert.equal(choices.length, 1 + QUICK_TARGET_LANGUAGES.length);
  assert.equal(choices[0].title, "Extension's language (<en>)");
  assert.deepEqual(
    choices.filter((entry) => entry.checked).map(({ title }) => title),
    ["Extension's language (<en>)"],
  );
  const swedish = languages(
    entries(
      state({
        pageTranslate: {
          ...mergePreferences({}).pageTranslate!,
          targetLanguage: "sv",
        },
      }),
    ),
  );
  assert.equal(swedish.at(-1)?.title, "<sv>");
  assert.equal(swedish.at(-1)?.checked, true);
  // Not a web page: only "Translate into" works.
  const other = entries(state({}, { host: undefined }));
  assert.deepEqual(
    other
      .filter((entry) => !entry.parentId && entry.enabled)
      .map(({ id }) => id),
    [ACTION_MENU_ID.translateInto],
  );
});

test("a click on the toolbar button's menu is a page tool change", () => {
  assert.deepEqual(actionMenuChange(ACTION_MENU_ID.translatePage, undefined), {
    tool: "translate",
  });
  assert.deepEqual(actionMenuChange(ACTION_MENU_ID.smartBar, true), {
    tool: "smartBar",
    on: true,
  });
  assert.deepEqual(actionMenuChange(ACTION_MENU_ID.subtitles, false), {
    tool: "subtitles",
    on: false,
  });
  assert.deepEqual(
    actionMenuChange(`${ACTION_MENU_ID.translateInto}:zh-TW`, true),
    { tool: "targetLanguage", language: "zh-TW" },
  );
  assert.deepEqual(actionMenuChange(`${ACTION_MENU_ID.translateInto}:`, true), {
    tool: "targetLanguage",
    language: "",
  });
  assert.equal(actionMenuChange("oba-ask", undefined), undefined);
});
