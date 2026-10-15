import type { Plural } from "./plural";
import { enUS, type LocaleMessages } from "./locales/en-US";
import { deDE } from "./locales/de-DE";
import { esES } from "./locales/es-ES";
import { frFR } from "./locales/fr-FR";
import { jaJP } from "./locales/ja-JP";
import { ko } from "./locales/ko";
import { ptBR } from "./locales/pt-BR";
import { zhCN } from "./locales/zh-CN";
import { zhTW } from "./locales/zh-TW";
import {
  DEFAULT_UI_LANGUAGE,
  resolveLanguage,
  type UiLanguage,
} from "./ui-languages";

const MESSAGES: Record<UiLanguage, LocaleMessages> = {
  "en-US": enUS,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "ja-JP": jaJP,
  ko,
  "fr-FR": frFR,
  "de-DE": deDE,
  "es-ES": esES,
  "pt-BR": ptBR,
};

// Each plural message knows its locale, so formatCount needs no other
// state to pick the form and format numbers.
const PLURAL_LANGUAGE = new WeakMap<Plural, string>();
const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);
for (const [code, messages] of Object.entries(MESSAGES))
  tagPlurals(messages, code);

function tagPlurals(value: unknown, language: string) {
  if (!value || typeof value !== "object") return;
  if (isPlural(value)) PLURAL_LANGUAGE.set(value, language);
  else for (const child of Object.values(value)) tagPlurals(child, language);
}

function isPlural(value: object): value is Plural {
  return (
    typeof (value as Plural).other === "string" &&
    Object.keys(value).every((key) => PLURAL_FORMS.has(key))
  );
}

// The UI language each set of messages is in, so code that shows them can
// format numbers and dates to match (format.ts).
const MESSAGES_LANGUAGE = new Map<LocaleMessages, UiLanguage>(
  Object.entries(MESSAGES).map(([code, messages]) => [
    messages,
    code as UiLanguage,
  ]),
);

export function getMessages(language?: string) {
  return MESSAGES[resolveLanguage(language)];
}

export function languageOf(messages: LocaleMessages): UiLanguage {
  return MESSAGES_LANGUAGE.get(messages) ?? DEFAULT_UI_LANGUAGE;
}

export type Messages = LocaleMessages;

// The messages of every UI language, e.g. to recognize text stored in
// whichever language was on at the time.
export const ALL_MESSAGES: readonly Messages[] = Object.values(MESSAGES);

// Fills `{count}` into the plural form the message's language uses for it,
// and any other `{name}` placeholders from `values`.
export function formatCount(
  message: Plural,
  count: number,
  values: Record<string, string | number> = {},
) {
  const language = PLURAL_LANGUAGE.get(message) ?? DEFAULT_UI_LANGUAGE;
  const form = new Intl.PluralRules(language).select(count);
  const number = new Intl.NumberFormat(language);
  return Object.entries({ ...values, count }).reduce(
    (text, [key, value]) =>
      text.replaceAll(
        `{${key}}`,
        typeof value === "number" ? number.format(value) : value,
      ),
    message[form] ?? message.other,
  );
}
