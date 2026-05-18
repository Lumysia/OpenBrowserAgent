import type { ReactNode } from "react";
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
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function GeneralPage() {
  const [language, setLanguage] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = getMessages(language);
  const accentOptions = [
    { id: "pink", label: t.options.pinkTheme },
    { id: "green", label: t.options.greenTheme },
    { id: "blue", label: t.options.blueTheme },
    { id: "purple", label: t.options.purpleTheme },
    { id: "amber", label: t.options.amberTheme },
  ] as const;

  if (!preferences) return null;

  return (
    <div className="stack">
      <div>
        <h1 className="settings-page-title">
          <SlidersHorizontal size={24} /> {t.options.general}
        </h1>
        <p className="muted">{t.options.languageDescription}</p>
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
            <SelectTrigger>
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
          <div
            className="accent-picker"
            role="radiogroup"
            aria-label={t.options.colorScheme}
          >
            {accentOptions.map((option) => {
              const selected =
                (preferences.accentColor || "pink") === option.id;
              return (
                <Tooltip key={option.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`accent-dot accent-dot-${option.id}${selected ? " active" : ""}`}
                      aria-label={option.label}
                      aria-checked={selected}
                      role="radio"
                      onClick={() =>
                        setPreferences((previous) => ({
                          ...previous,
                          accentColor: option.id,
                        }))
                      }
                    >
                      <span />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{option.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
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
      <PreferenceSwitch
        icon={<ScrollText size={18} />}
        title={t.options.autoScroll}
        description={t.options.autoScrollDescription}
        checked={preferences.autoScroll !== false}
        onChange={(checked) =>
          setPreferences((previous) => ({ ...previous, autoScroll: checked }))
        }
      />
      <PreferenceSwitch
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

function PreferenceSwitch({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Card>
      <CardContent>
        <div className="setting-switch-row">
          <div>
            <CardTitle className="settings-section-title">
              {icon} {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Switch checked={checked} onCheckedChange={onChange} />
        </div>
      </CardContent>
    </Card>
  );
}

function parseMaxToolSteps(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_STEPS;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(parsed)));
}
