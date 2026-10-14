import {
  Languages,
  MonitorCog,
  Palette,
  PartyPopper,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { resolveLanguage, UI_LANGUAGES } from "../../src/shared/ui-languages";
import { storage } from "../../src/shared/storage";
import {
  Input,
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
import { useStoredState } from "../../src/ui/useStoredState";
import { ThemePicker } from "./theme-picker";

export function GeneralPage() {
  const [language, setLanguage] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = getMessages(language);

  if (!preferences) return null;

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<SlidersHorizontal />}
        title={t.options.general}
        description={t.options.generalDescription}
      />
      <SettingsSection
        icon={<Languages />}
        title={t.common.language}
        description={t.options.languageDescription}
      >
        <Select value={resolveLanguage(language)} onValueChange={setLanguage}>
          <SelectTrigger aria-label={t.common.language}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_LANGUAGES.map(({ code: id, label }) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsSection>
      <SettingsSection
        icon={<Palette />}
        title={t.options.colorScheme}
        description={t.options.colorSchemeDescription}
      >
        <ThemePicker
          t={t}
          value={preferences.accentColor}
          colorScheme={preferences.colorScheme}
          onChange={(accentColor) =>
            setPreferences((previous) => ({ ...previous, accentColor }))
          }
        />
      </SettingsSection>
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
      <SettingSwitchCard
        icon={<PartyPopper size={18} />}
        title={t.themes.holidayTouches}
        description={t.themes.holidayTouchesDescription}
        checked={preferences.holidayTouches !== false}
        onChange={(checked) =>
          setPreferences((previous) => ({
            ...previous,
            holidayTouches: checked,
          }))
        }
      />
      <SettingSwitchCard
        icon={<ScrollText size={18} />}
        title={t.options.autoScroll}
        description={t.options.autoScrollDescription}
        checked={preferences.autoScroll !== false}
        onChange={(checked) =>
          setPreferences((previous) => ({ ...previous, autoScroll: checked }))
        }
      />
      <SettingSwitchCard
        icon={<RefreshCw size={18} />}
        title={t.options.autoRetry}
        description={t.options.autoRetryDescription}
        checked={preferences.autoRetry !== false}
        onChange={(checked) =>
          setPreferences((previous) => ({ ...previous, autoRetry: checked }))
        }
      />
      <SettingsSection
        icon={<Wrench />}
        title={t.options.maxToolSteps}
        description={t.options.maxToolStepsDescription}
      >
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
      </SettingsSection>
    </div>
  );
}

function parseMaxToolSteps(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(parsed)));
}
