import { useState } from "react";
import {
  Bot,
  Cpu,
  Database,
  ExternalLink,
  Languages,
  PanelsTopLeft,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { PRIVACY_POLICY_TRANSLATION_URL } from "../../src/shared/config";
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
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { ModelSelect } from "./model-select";

// Select value for "follow the extension's language"; stored as "".
const FOLLOW_INTERFACE = "interface";

// Only browsers with the Translator API offer the on-device engine.
const hasBrowserTranslator = "Translator" in globalThis;

export function PageTranslatePage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "cleared">(
    "idle",
  );
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
  const engines = PAGE_TRANSLATE_ENGINES.filter(
    (engine) =>
      engine !== PAGE_TRANSLATE_ENGINE.browser ||
      hasBrowserTranslator ||
      settings.engine === engine,
  );
  const names = displayNames(language);
  const interfaceLanguage = matchTargetLanguage(language) || "en";
  const cloud = FREE_CLOUD_ENGINES.includes(settings.engine)
    ? (settings.engine as keyof typeof p.cloudNotice)
    : undefined;
  const clearCache = async () => {
    setCacheState("clearing");
    await clearTranslations().catch(() => undefined);
    setCacheState("cleared");
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
              {engines.map((engine) => (
                <SelectItem key={engine} value={engine}>
                  {p.engines[engine]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CardDescription>{p.engineDetails[settings.engine]}</CardDescription>
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
      {settings.engine === PAGE_TRANSLATE_ENGINE.model && (
        <Card>
          <CardHeader>
            <CardTitle className="settings-section-title">
              <Bot size={18} /> {p.model}
            </CardTitle>
            <CardDescription>{p.modelDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ModelSelect
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
