// The toolbar button's own right-click menu: the page tools (page-tools.ts)
// for the active tab. Chrome shows at most 6 top-level items there.
import { menuTitle, type ContextMenuEntry } from "./context-menu";
import { QUICK_TARGET_LANGUAGES } from "./page-translate/languages";
import type { PageToolChange, PageToolsState } from "./page-tools";

export const ACTION_MENU_ID = {
  translatePage: "oba-action-translate-page",
  translateInto: "oba-action-translate-into",
  pageButton: "oba-action-page-button",
  smartBar: "oba-action-smart-bar",
  subtitles: "oba-action-subtitles",
} as const;

// A "Translate into" choice's id; the extension's language has an empty tag.
const LANGUAGE_ID_PREFIX = `${ACTION_MENU_ID.translateInto}:`;

export const ACTION_MENU_TOP_LEVEL_LIMIT = 6;

export type ActionMenuTitles = {
  translatePage: string;
  showOriginal: string;
  // {language}: the language pages are translated into now.
  translateInto: string;
  // {language}: the extension's language.
  followInterface: string;
  pageButton: string;
  smartBar: string;
  subtitles: string;
};

// `contexts`: the browser's name for the toolbar button's menu.
// `languageName` names a language tag in the extension's language.
export function actionMenuEntries(
  state: PageToolsState,
  titles: ActionMenuTitles,
  {
    contexts,
    languageName,
    interfaceLanguage,
  }: {
    contexts: string[];
    languageName: (tag: string) => string;
    // The language "the extension's language" means for translation.
    interfaceLanguage: string;
  },
): ContextMenuEntry[] {
  const web = !!state.host;
  const entry = (
    id: string,
    title: string,
    extra: Partial<ContextMenuEntry> = {},
  ): ContextMenuEntry => ({
    id,
    title: menuTitle(title),
    contexts,
    enabled: web,
    ...extra,
  });
  const languages = [
    "",
    ...QUICK_TARGET_LANGUAGES,
    ...(state.targetLanguage &&
    !QUICK_TARGET_LANGUAGES.includes(state.targetLanguage)
      ? [state.targetLanguage]
      : []),
  ];
  return [
    entry(
      ACTION_MENU_ID.translatePage,
      state.translated ? titles.showOriginal : titles.translatePage,
    ),
    entry(
      ACTION_MENU_ID.translateInto,
      titles.translateInto.replace(
        "{language}",
        languageName(state.resolvedTarget),
      ),
      // Not tied to the page.
      { enabled: true },
    ),
    ...languages.map((tag) => ({
      id: LANGUAGE_ID_PREFIX + tag,
      parentId: ACTION_MENU_ID.translateInto,
      title: menuTitle(
        tag
          ? languageName(tag)
          : titles.followInterface.replace(
              "{language}",
              languageName(interfaceLanguage),
            ),
      ),
      contexts,
      type: "radio" as const,
      checked: state.targetLanguage === tag,
    })),
    entry(ACTION_MENU_ID.pageButton, titles.pageButton, {
      type: "checkbox",
      checked: state.pageButton.on,
      enabled: state.pageButton.available,
    }),
    entry(ACTION_MENU_ID.smartBar, titles.smartBar, {
      type: "checkbox",
      checked: state.smartBar,
    }),
    entry(ACTION_MENU_ID.subtitles, titles.subtitles, {
      type: "checkbox",
      checked: state.subtitles,
      visible: state.video,
    }),
  ];
}

// The change a click on the menu asks for; `checked` is the item's state
// after the click. Undefined for other items.
export function actionMenuChange(
  menuItemId: string | number,
  checked: boolean | undefined,
): PageToolChange | undefined {
  const id = String(menuItemId);
  if (id.startsWith(LANGUAGE_ID_PREFIX))
    return {
      tool: "targetLanguage",
      language: id.slice(LANGUAGE_ID_PREFIX.length),
    };
  switch (id) {
    case ACTION_MENU_ID.translatePage:
      return { tool: "translate" };
    case ACTION_MENU_ID.pageButton:
      return { tool: "pageButton", on: checked === true };
    case ACTION_MENU_ID.smartBar:
      return { tool: "smartBar", on: checked === true };
    case ACTION_MENU_ID.subtitles:
      return { tool: "subtitles", on: checked === true };
    default:
      return undefined;
  }
}
