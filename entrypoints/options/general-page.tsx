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
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function GeneralPage() {
  const [language, setLanguage] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const t = getMessages(language);
  const accentOptions = [
    { id: "green", label: t.options.greenTheme },
    { id: "blue", label: t.options.blueTheme },
    { id: "pink", label: t.options.pinkTheme },
    { id: "purple", label: t.options.purpleTheme },
    { id: "amber", label: t.options.amberTheme },
  ] as const;

  if (!preferences) return null;

  return (
    <div className="stack">
      <div>
        <h1>{t.options.general}</h1>
        <p className="muted">{t.options.languageDescription}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t.common.language}</CardTitle>
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
          <CardTitle>{t.options.colorScheme}</CardTitle>
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
                (preferences.accentColor || "amber") === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`accent-dot accent-dot-${option.id}${selected ? " active" : ""}`}
                  aria-label={option.label}
                  aria-checked={selected}
                  role="radio"
                  title={option.label}
                  onClick={() =>
                    setPreferences({ ...preferences, accentColor: option.id })
                  }
                >
                  <span />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.options.appearance}</CardTitle>
          <CardDescription>{t.options.appearanceDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.colorScheme || "system"}
            onValueChange={(colorScheme) =>
              setPreferences({
                ...preferences,
                colorScheme: colorScheme as "system" | "light" | "dark",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t.options.systemTheme}</SelectItem>
              <SelectItem value="light">{t.options.lightTheme}</SelectItem>
              <SelectItem value="dark">{t.options.darkTheme}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <PreferenceSwitch
        title={t.options.autoScroll}
        description={t.options.autoScrollDescription}
        checked={preferences.autoScroll !== false}
        onChange={(checked) =>
          setPreferences({ ...preferences, autoScroll: checked })
        }
      />
      <PreferenceSwitch
        title={t.options.autoRetry}
        description={t.options.autoRetryDescription}
        checked={preferences.autoRetry !== false}
        onChange={(checked) =>
          setPreferences({ ...preferences, autoRetry: checked })
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t.options.maxToolSteps}</CardTitle>
          <CardDescription>{t.options.maxToolStepsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            min={0}
            step={1}
            value={String(preferences.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS)}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                maxToolSteps: parseMaxToolSteps(event.currentTarget.value),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PreferenceSwitch({
  title,
  description,
  checked,
  onChange,
}: {
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
            <CardTitle>{title}</CardTitle>
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
