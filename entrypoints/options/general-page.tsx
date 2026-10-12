import {
  Bot,
  Languages,
  MonitorCog,
  Palette,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { normalizeProviderState } from "../../src/shared/provider-instances";
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingSwitchCard,
  RadioGroup,
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

// Select value for "use the chat's own model"; stored as an empty id.
const CHAT_MODEL = "chat-model";

export function GeneralPage() {
  const [language, setLanguage] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [providers] = useStoredState(storage.provider);
  const models = Object.values(normalizeProviderState(providers || {})).flatMap(
    (provider) =>
      (provider.models || []).map((model) => ({
        id: model.id,
        label: [model.displayName || model.name, provider.label]
          .filter(Boolean)
          .join(" · "),
      })),
  );
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
          <RadioGroup
            className="accent-picker"
            aria-label={t.options.colorScheme}
            value={preferences.accentColor || "pink"}
            onValueChange={(value) =>
              setPreferences((previous) => ({
                ...previous,
                accentColor: value as typeof preferences.accentColor,
              }))
            }
          >
            {accentOptions.map((option) => {
              return (
                <Tooltip key={option.id}>
                  <TooltipTrigger asChild>
                    <RadioGroupItem
                      value={option.id}
                      className={`accent-dot accent-dot-${option.id}`}
                      aria-label={option.label}
                    >
                      <span />
                    </RadioGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>{option.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </RadioGroup>
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
            <Bot size={18} /> {t.options.helperModel}
          </CardTitle>
          <CardDescription>{t.options.helperModelDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.helperModelId || CHAT_MODEL}
            onValueChange={(value) =>
              setPreferences((previous) => ({
                ...previous,
                helperModelId: value === CHAT_MODEL ? "" : value,
              }))
            }
          >
            <SelectTrigger aria-label={t.options.helperModel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CHAT_MODEL}>
                {t.options.helperModelSameAsChat}
              </SelectItem>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
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
