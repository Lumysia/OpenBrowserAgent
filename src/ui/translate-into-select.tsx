import { PAGE_TRANSLATE_LANGUAGES } from "../shared/page-translate/languages";
import {
  matchTargetLanguage,
  normalizePageTranslateSettings,
} from "../shared/page-translate/settings";
import { storage } from "../shared/storage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components";
import { useMessages, useUiLanguage } from "./messages";
import { useStoredState } from "./useStoredState";

// Select value for "follow the extension's language"; stored as "".
const FOLLOW_INTERFACE = "interface";

// The stored "Translate into" (page translation's target) and its setter;
// undefined while the preferences load. "" is the extension's language.
export function useTranslateInto() {
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const value =
    preferences &&
    normalizePageTranslateSettings(preferences.pageTranslate).targetLanguage;
  const set = (targetLanguage: string) =>
    setPreferences((previous) => ({
      ...previous,
      pageTranslate: {
        ...normalizePageTranslateSettings(previous.pageTranslate),
        targetLanguage,
      },
    }));
  return [value, set] as const;
}

// The "Translate into" choice; nothing while the preferences load.
export function TranslateIntoSelect({
  variant,
}: {
  variant?: "field" | "inline";
}) {
  const [value, onChange] = useTranslateInto();
  const language = useUiLanguage();
  const p = useMessages().pageTranslate;
  const names = displayNames(language);
  const interfaceLanguage = matchTargetLanguage(language) || "en";
  if (value === undefined) return null;
  return (
    <Select
      value={value || FOLLOW_INTERFACE}
      onValueChange={(next) => onChange(next === FOLLOW_INTERFACE ? "" : next)}
    >
      <SelectTrigger variant={variant} aria-label={p.targetLanguage}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FOLLOW_INTERFACE}>
          {p.followInterface.replace("{language}", names(interfaceLanguage))}
        </SelectItem>
        {PAGE_TRANSLATE_LANGUAGES.map(({ tag }) => (
          <SelectItem key={tag} value={tag}>
            {names(tag)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Chinese is named by its script ("Simplified Chinese"), as people choose it.
const NAMED_BY_SCRIPT: Record<string, string> = {
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
};

// Language names in the extension's language.
function displayNames(language: string | undefined) {
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames([language || "en"], { type: "language" });
  } catch {
    names = undefined;
  }
  return (tag: string) => names?.of(NAMED_BY_SCRIPT[tag] ?? tag) || tag;
}
