import {
  Languages,
  MonitorCog,
  Palette,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { languageLabels } from "../../src/shared/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingSwitchCard,
  ToggleGroup,
  ToggleGroupItem,
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
      <div>
        <h1 className="settings-page-title">
          <SlidersHorizontal size={24} /> {t.options.general}
        </h1>
        <p className="muted">{t.options.generalDescription}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Languages size={18} /> {t.common.language}
          </CardTitle>
          <CardDescription>{t.options.languageDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={language || "en-US"} onValueChange={setLanguage}>
            <SelectTrigger aria-label={t.common.language}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(languageLabels).map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Palette size={18} /> {t.options.colorScheme}
          </CardTitle>
          <CardDescription>{t.options.colorSchemeDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePicker
            t={t}
            value={preferences.accentColor}
            colorScheme={preferences.colorScheme}
            onChange={(accentColor) =>
              setPreferences((previous) => ({ ...previous, accentColor }))
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <MonitorCog size={18} /> {t.options.appearance}
          </CardTitle>
          <CardDescription>{t.options.appearanceDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
            <ToggleGroupItem value="dark">
              {t.options.darkTheme}
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title">
            <Wrench size={18} /> {t.options.maxToolSteps}
          </CardTitle>
          <CardDescription>{t.options.maxToolStepsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}

function parseMaxToolSteps(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(parsed)));
}
