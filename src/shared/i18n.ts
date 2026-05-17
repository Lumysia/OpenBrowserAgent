import { enUS, type LocaleMessages } from "./locales/en-US";
import { deDE } from "./locales/de-DE";
import { esES } from "./locales/es-ES";
import { frFR } from "./locales/fr-FR";
import { jaJP } from "./locales/ja-JP";
import { ko } from "./locales/ko";
import { ptBR } from "./locales/pt-BR";
import { zhCN } from "./locales/zh-CN";
import { zhTW } from "./locales/zh-TW";

export const i18nRegistry: Record<string, LocaleMessages> = {
  "en-US": enUS,
  "zh-CN": zhCN,
  "zh-SG": zhCN,
  "zh-TW": zhTW,
  "zh-HK": zhTW,
  "ja-JP": jaJP,
  ko,
  "fr-FR": frFR,
  "de-DE": deDE,
  "es-ES": esES,
  "pt-BR": ptBR,
};

export function getMessages(language?: string) {
  const normalized = language?.replace("_", "-");
  return i18nRegistry[language || ""] || i18nRegistry[normalized || ""] || enUS;
}

export type Messages = LocaleMessages;
