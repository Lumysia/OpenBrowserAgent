import { Languages } from "lucide-react";
import { PAGE_TRANSLATE_LANGUAGES } from "../../src/shared/page-translate/languages";
import {
  matchTargetLanguage,
  normalizePageTranslateSettings,
} from "../../src/shared/page-translate/settings";
import { storage } from "../../src/shared/storage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
} from "../../src/ui/components";
import { useMessages, useUiLanguage } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";

// Select value for "follow the extension's language"; stored as "".
const FOLLOW_INTERFACE = "interface";

// The language pages are translated into (page translation's target).
export function TranslateIntoSection() {
  const language = useUiLanguage();
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = useMessages();
  const p = t.pageTranslate;
  if (!preferences) return null;
  const settings = normalizePageTranslateSettings(preferences.pageTranslate);
  const names = displayNames(language);
  const interfaceLanguage = matchTargetLanguage(language) || "en";
  return (
    <SettingsSection
      icon={<Languages />}
      title={p.targetLanguage}
      description={p.targetLanguageDescription}
    >
      <Select
        value={settings.targetLanguage || FOLLOW_INTERFACE}
        onValueChange={(value) =>
          setPreferences((previous) => ({
            ...previous,
            pageTranslate: {
              ...normalizePageTranslateSettings(previous.pageTranslate),
              targetLanguage: value === FOLLOW_INTERFACE ? "" : value,
            },
          }))
        }
      >
        <SelectTrigger aria-label={p.targetLanguage}>
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
    </SettingsSection>
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
