import {
  MessagesSquare,
  MonitorCog,
  Palette,
  PartyPopper,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { DEFAULT_MAX_TOOL_STEPS, OPTIONS_HASH } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { restartSetup } from "../../src/shared/setup-progress";
import { storage } from "../../src/shared/storage";
import {
  Accordion,
  Button,
  Input,
  Label,
  SettingToggleRow,
  SettingsAccordionItem,
  SettingsSummary,
  ToggleGroup,
  ToggleGroupItem,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { ShortcutsSection } from "./shortcuts-section";
import { ThemePicker } from "./theme-picker";
import { TranslateIntoSection } from "./translate-into";
import { UiLanguageSection } from "./ui-language-section";

export function GeneralPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = getMessages(language);

  if (!preferences) return null;

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<SlidersHorizontal />}
        title={t.options.general}
        description={t.options.generalDescription}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              restartSetup(OPTIONS_HASH.general).catch(console.warn)
            }
          >
            <Sparkles size={16} /> {t.setup.runAgain}
          </Button>
        }
      />
      <TranslateIntoSection />
      <UiLanguageSection />
      <SettingsSection
        icon={<MonitorCog />}
        title={t.options.appearance}
        description={t.options.appearanceDescription}
      >
        <ToggleGroup
          type="single"
          className="appearance-toggle-group"
          value={preferences.colorScheme || "system"}
          onValueChange={(colorScheme) => {
            if (!colorScheme) return;
            setPreferences((previous) => ({
              ...previous,
              colorScheme: colorScheme as "system" | "light" | "dark",
            }));
          }}
        >
          <ToggleGroupItem value="system">
            {t.options.systemTheme}
          </ToggleGroupItem>
          <ToggleGroupItem value="light">
            {t.options.lightTheme}
          </ToggleGroupItem>
          <ToggleGroupItem value="dark">{t.options.darkTheme}</ToggleGroupItem>
        </ToggleGroup>
      </SettingsSection>
      <SettingsSection
        icon={<Palette />}
        title={t.options.colorScheme}
        description={t.options.colorSchemeDescription}
      >
        <ThemePicker
          value={preferences.accentColor}
          colorScheme={preferences.colorScheme}
          onChange={(accentColor) =>
            setPreferences((previous) => ({ ...previous, accentColor }))
          }
        />
      </SettingsSection>
      <ShortcutsSection />
      <Accordion type="single" collapsible>
        <SettingsAccordionItem
          value="chat-behavior"
          chevronLabel={t.settings.chatBehavior}
          contentClassName="stack"
          summary={
            <SettingsSummary
              icon={<MessagesSquare size={18} />}
              title={t.settings.chatBehavior}
              description={t.settings.chatBehaviorDescription}
            />
          }
        >
          <div className="settings-toggle-list">
            <SettingToggleRow
              icon={<ScrollText size={18} />}
              title={t.options.autoScroll}
              description={t.options.autoScrollDescription}
              value={preferences.autoScroll !== false}
              onChange={(checked) =>
                setPreferences((previous) => ({
                  ...previous,
                  autoScroll: checked,
                }))
              }
            />
            <SettingToggleRow
              icon={<RefreshCw size={18} />}
              title={t.options.autoRetry}
              description={t.options.autoRetryDescription}
              value={preferences.autoRetry !== false}
              onChange={(checked) =>
                setPreferences((previous) => ({
                  ...previous,
                  autoRetry: checked,
                }))
              }
            />
            <SettingToggleRow
              icon={<PartyPopper size={18} />}
              title={t.themes.holidayTouches}
              description={t.themes.holidayTouchesDescription}
              value={preferences.holidayTouches !== false}
              onChange={(checked) =>
                setPreferences((previous) => ({
                  ...previous,
                  holidayTouches: checked,
                }))
              }
            />
          </div>
          <Label>
            <span className="settings-section-title">
              <Wrench size={18} /> {t.options.maxToolSteps}
            </span>
            <Input
              aria-label={t.options.maxToolSteps}
              type="number"
              min={0}
              step={1}
              value={String(preferences.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS)}
              onChange={(event) =>
                setPreferences((previous) => ({
                  ...previous,
                  maxToolSteps: parseMaxToolSteps(event.currentTarget.value),
                }))
              }
            />
            <small className="muted">{t.options.maxToolStepsDescription}</small>
          </Label>
        </SettingsAccordionItem>
      </Accordion>
    </div>
  );
}

function parseMaxToolSteps(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(parsed)));
}
