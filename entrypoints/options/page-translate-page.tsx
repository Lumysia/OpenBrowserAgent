import { useState } from "react";
import {
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
import { clearTranslations } from "../../src/shared/page-translate/cache";
import {
  FREE_CLOUD_ENGINES,
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
  CardDescription,
  Disclosure,
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
import {
  ContextMenuItemsSection,
  TRANSLATE_MENU_ITEMS,
} from "./context-menu-page";
import { PageTranslateAccess } from "./page-translate-access";
import { SubtitleStyleSection } from "./subtitle-style-section";
import { useMessages } from "../../src/ui/messages";

// Without the Translator API the on-device engine can't translate here.
const hasBrowserTranslator = "Translator" in globalThis;

export function PageTranslatePage() {
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "cleared">(
    "idle",
  );
  const [cacheError, setCacheError] = useState("");
  const t = useMessages();
  const p = t.pageTranslate;
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
      <PageTranslateAccess settings={settings} update={update} />
      <ContextMenuItemsSection
        items={TRANSLATE_MENU_ITEMS}
        title={t.settings.translateMenuItems}
        description={t.settings.translateMenuItemsDescription}
      />
      <SettingSwitchCard
        icon={<Captions size={18} />}
        title={p.subtitles.setting}
        description={p.subtitles.settingDescription}
        checked={settings.videoSubtitles}
        onChange={(videoSubtitles) => update({ videoSubtitles })}
      />
      <SubtitleStyleSection
        style={settings.subtitleStyle}
        theme={preferences.accentColor}
        onChange={(subtitleStyle) => update({ subtitleStyle })}
      />
      <Disclosure label={t.settings.advanced}>
        <SettingSwitchCard
          icon={<Menu size={18} />}
          title={p.translateMenus}
          description={p.translateMenusDescription}
          checked={settings.translateMenus}
          onChange={(translateMenus) => update({ translateMenus })}
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
      </Disclosure>
    </div>
  );
}
