// Page translation's own locale namespace, looked up like the main messages.
import { resolveLanguage } from "../i18n";
import { pageTranslateDeDE } from "../locales/page-translate/de-DE";
import {
  pageTranslateEnUS,
  type PageTranslateLocaleMessages,
} from "../locales/page-translate/en-US";
import { pageTranslateEsES } from "../locales/page-translate/es-ES";
import { pageTranslateFrFR } from "../locales/page-translate/fr-FR";
import { pageTranslateJaJP } from "../locales/page-translate/ja-JP";
import { pageTranslateKo } from "../locales/page-translate/ko";
import { pageTranslatePtBR } from "../locales/page-translate/pt-BR";
import { pageTranslateZhCN } from "../locales/page-translate/zh-CN";
import { pageTranslateZhTW } from "../locales/page-translate/zh-TW";

const registry: Record<string, PageTranslateLocaleMessages> = {
  "en-US": pageTranslateEnUS,
  "zh-CN": pageTranslateZhCN,
  "zh-SG": pageTranslateZhCN,
  "zh-TW": pageTranslateZhTW,
  "zh-HK": pageTranslateZhTW,
  "ja-JP": pageTranslateJaJP,
  ko: pageTranslateKo,
  "fr-FR": pageTranslateFrFR,
  "de-DE": pageTranslateDeDE,
  "es-ES": pageTranslateEsES,
  "pt-BR": pageTranslatePtBR,
};

export type { PageTranslateLocaleMessages };

export function getPageTranslateMessages(language?: string) {
  return registry[resolveLanguage(language)] ?? pageTranslateEnUS;
}
