export const COMPOSER_MENU = {
  add: "add",
  model: "model",
  mode: "mode",
} as const;

export type ComposerMenu = (typeof COMPOSER_MENU)[keyof typeof COMPOSER_MENU];

export const ADD_MENU_VIEW = {
  menu: "menu",
  tabs: "tabs",
  skills: "skills",
} as const;

export type AddMenuView = (typeof ADD_MENU_VIEW)[keyof typeof ADD_MENU_VIEW];

export type ActiveStream = {
  chatId: string;
  assistantMessageId: string;
  retryCount: number;
  hasProgress: boolean;
};
