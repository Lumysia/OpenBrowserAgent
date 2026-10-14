import { useState } from "react";
import {
  Bot,
  Captions,
  Cpu,
  Database,
  ExternalLink,
  Languages,
  Menu,
  PanelsTopLeft,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { PRIVACY_POLICY_TRANSLATION_URL } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { clearTranslations } from "../../src/shared/page-translate/cache";
import { PAGE_TRANSLATE_LANGUAGES } from "../../src/shared/page-translate/languages";
import { getPageTranslateMessages } from "../../src/shared/page-translate/messages";
import {
  FREE_CLOUD_ENGINES,
  matchTargetLanguage,
  normalizePageTranslateSettings,
  PAGE_TRANSLATE_DISPLAY,
  PAGE_TRANSLATE_ENGINE,
  PAGE_TRANSLATE_ENGINES,
  PAGE_TRANSLATE_FALLBACK,
  type PageTranslateDisplay,
  type PageTranslateEngine,
  type PageTranslateSettings,
} from "../../src/shared/page-translate/settings";
import { storage } from "../../src/shared/storage";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import {
  Button,
  CardDescription,
  Feedback,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingSwitchCard,
  ToggleGroup,
  ToggleGroupItem,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { errorWithDetail } from "../../src/shared/user-errors";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect, useConfiguredModels } from "./model-select";
import { useUiLanguage } from "../../src/ui/messages";

// Select value for "follow the extension's language"; stored as "".
const FOLLOW_INTERFACE = "interface";

// Without the Translator API the on-device engine falls back to the AI model.
const hasBrowserTranslator = "Translator" in globalThis;

export function PageTranslatePage() {
  const language = useUiLanguage();
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "cleared">(
    "idle",
  );
  const [cacheError, setCacheError] = useState("");
  const t = getMessages(language);
  const models = useConfiguredModels();
  const p = getPageTranslateMessages(language);
  if (!preferences) return null;
  const settings = normalizePageTranslateSettings(preferences.pageTranslate);
  const update = (change: Partial<PageTranslateSettings>) =>
    setPreferences((previous) => ({
      ...previous,
      pageTranslate: {
        ...normalizePageTranslateSettings(previous.pageTranslate),
        ...change,
      },
    }));
  const browserMissing =
    settings.engine === PAGE_TRANSLATE_ENGINE.browser && !hasBrowserTranslator;
  // The model card also serves an engine that falls back to the model.
  const usesModel =
    settings.engine === PAGE_TRANSLATE_ENGINE.model ||
    PAGE_TRANSLATE_FALLBACK[settings.engine] === PAGE_TRANSLATE_ENGINE.model;
  const names = displayNames(language);
  const interfaceLanguage = matchTargetLanguage(language) || "en";
  const cloud = FREE_CLOUD_ENGINES.includes(settings.engine)
    ? (settings.engine as keyof typeof p.cloudNotice)
    : undefined;
  const clearCache = async () => {
    setCacheState("clearing");
    setCacheError("");
    try {
      await clearTranslations();
      setCacheState("cleared");
    } catch (error) {
      setCacheError(errorWithDetail(p.clearCacheFailed, error, t));
      setCacheState("idle");
    }
  };

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Languages />}
        title={p.settingsTitle}
        description={p.settingsDescription}
      />
      <SettingsSection
        icon={<Cpu />}
        title={p.engine}
        description={p.engineDescription}
        contentClassName="stack"
      >
        <Select
          value={settings.engine}
          onValueChange={(engine) =>
            update({ engine: engine as PageTranslateEngine })
          }
        >
          <SelectTrigger aria-label={p.engine}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_TRANSLATE_ENGINES.map((engine) => (
              <SelectItem key={engine} value={engine}>
                {p.engines[engine]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CardDescription>
          {browserMissing ? p.browserMissing : p.engineDetails[settings.engine]}
        </CardDescription>
        {cloud && (
          <div className="split">
            <Feedback>
              <ShieldAlert size={14} aria-hidden /> {p.cloudNotice[cloud]}
            </Feedback>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void openOrFocusUrl(PRIVACY_POLICY_TRANSLATION_URL)
              }
            >
              <ExternalLink size={14} />
              {p.privacyLink}
            </Button>
          </div>
        )}
      </SettingsSection>
      {usesModel && (
        <SettingsSection
          icon={<Bot />}
          title={p.model}
          description={p.modelDescription}
        >
          <ModelSelect
            t={t}
            models={models}
            value={settings.modelId}
            noneLabel={p.defaultModel}
            label={p.model}
            onChange={(modelId = "") => update({ modelId })}
          />
        </SettingsSection>
      )}
      <SettingsSection
        icon={<Languages />}
        title={p.targetLanguage}
        description={p.targetLanguageDescription}
      >
        <Select
          value={settings.targetLanguage || FOLLOW_INTERFACE}
          onValueChange={(value) =>
            update({
              targetLanguage: value === FOLLOW_INTERFACE ? "" : value,
            })
          }
        >
          <SelectTrigger aria-label={p.targetLanguage}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FOLLOW_INTERFACE}>
              {p.followInterface.replace(
                "{language}",
                names(interfaceLanguage),
              )}
            </SelectItem>
            {PAGE_TRANSLATE_LANGUAGES.map(({ tag }) => (
              <SelectItem key={tag} value={tag}>
                {names(tag)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsSection>
      <SettingsSection
        icon={<PanelsTopLeft />}
        title={p.display}
        description={p.displayDescription}
      >
        <ToggleGroup
          type="single"
          aria-label={p.display}
          value={settings.display}
          onValueChange={(display) =>
            display && update({ display: display as PageTranslateDisplay })
          }
        >
          {Object.values(PAGE_TRANSLATE_DISPLAY).map((display) => (
            <ToggleGroupItem key={display} value={display}>
              {p.displayModes[display]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsSection>
      <SettingSwitchCard
        icon={<Menu size={18} />}
        title={p.translateMenus}
        description={p.translateMenusDescription}
        checked={settings.translateMenus}
        onChange={(translateMenus) => update({ translateMenus })}
      />
      <SettingSwitchCard
        icon={<Captions size={18} />}
        title={p.subtitles.videoButton}
        description={p.subtitles.videoButtonDescription}
        checked={settings.videoButton}
        onChange={(videoButton) => update({ videoButton })}
      />
      <SettingsSection
        icon={<Database />}
        title={p.cache}
        description={p.cacheDescription}
        contentClassName="stack"
      >
        <div>
          <Button
            variant="outline"
            disabled={cacheState === "clearing"}
            onClick={() => void clearCache()}
          >
            <Trash2 size={16} />
            {p.clearCache}
          </Button>
        </div>
        {cacheState === "cleared" && <Feedback>{p.cacheCleared}</Feedback>}
        {cacheError && <Feedback error>{cacheError}</Feedback>}
      </SettingsSection>
    </div>
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
