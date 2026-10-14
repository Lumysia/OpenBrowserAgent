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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Feedback,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingSwitchCard,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { errorWithDetail } from "../../src/ui/error-text";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect } from "./model-select";

// Select value for "follow the extension's language"; stored as "".
const FOLLOW_INTERFACE = "interface";

// Without the Translator API the on-device engine falls back to the AI model.
const hasBrowserTranslator = "Translator" in globalThis;

export function PageTranslatePage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "cleared">(
    "idle",
  );
  const [cacheError, setCacheError] = useState("");
  const t = getMessages(language);
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
      <div>
        <h1 className="settings-page-title">
          <Languages size={24} /> {p.settingsTitle}
        </h1>
        <p className="muted">{p.settingsDescription}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Cpu size={18} /> {p.engine}
          </CardTitle>
          <CardDescription>{p.engineDescription}</CardDescription>
        </CardHeader>
        <CardContent className="stack">
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
            {browserMissing
              ? p.browserMissing
              : p.engineDetails[settings.engine]}
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
        </CardContent>
      </Card>
      {usesModel && (
        <Card>
          <CardHeader>
            <CardTitle className="settings-section-title">
              <Bot size={18} /> {p.model}
            </CardTitle>
            <CardDescription>{p.modelDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ModelSelect
              t={t}
              value={settings.modelId}
              defaultLabel={p.defaultModel}
              label={p.model}
              onChange={(modelId) => update({ modelId })}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Languages size={18} /> {p.targetLanguage}
          </CardTitle>
          <CardDescription>{p.targetLanguageDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <PanelsTopLeft size={18} /> {p.display}
          </CardTitle>
          <CardDescription>{p.displayDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Database size={18} /> {p.cache}
          </CardTitle>
          <CardDescription>{p.cacheDescription}</CardDescription>
        </CardHeader>
        <CardContent className="stack">
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
        </CardContent>
      </Card>
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
