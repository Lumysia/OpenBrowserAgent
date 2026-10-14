import { useId, type CSSProperties, type ReactNode } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  ACCENT_THEMES,
  normalizeTheme,
  PRIDE_THEMES,
  THEMES,
  type ThemeId,
} from "../../src/shared/theme/themes";
import { themeTokens } from "../../src/shared/theme/tokens";
import {
  RadioGroup,
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { resolveScheme } from "../../src/ui/apply-theme";

// The color themes, then the pride flags, as one choice.
export function ThemePicker({
  t,
  value,
  colorScheme,
  onChange,
}: {
  t: Messages;
  value: unknown;
  colorScheme: unknown;
  onChange: (theme: ThemeId) => void;
}) {
  const scheme = resolveScheme(colorScheme);
  const groups = [
    {
      label: t.themes.colorsGroup,
      ids: ACCENT_THEMES,
      fill: (id: ThemeId) => themeTokens(id, scheme)["accent-solid"],
      flag: false,
    },
    {
      label: t.themes.prideGroup,
      ids: PRIDE_THEMES,
      fill: (id: ThemeId) => flagGradient(THEMES[id].flag ?? []),
      flag: true,
    },
  ];
  return (
    <RadioGroup
      className="theme-picker"
      aria-label={t.options.colorScheme}
      value={normalizeTheme(value)}
      onValueChange={(next) => onChange(normalizeTheme(next))}
    >
      {groups.map((group) => (
        <SwatchGroup key={group.label} label={group.label}>
          {group.ids.map((id) => (
            <Swatch
              key={id}
              id={id}
              label={t.themes.names[id]}
              fill={group.fill(id)}
              flag={group.flag}
            />
          ))}
        </SwatchGroup>
      ))}
    </RadioGroup>
  );
}

// Horizontal stripes of equal height, as on the flag.
function flagGradient(stripes: string[]) {
  const step = 100 / stripes.length;
  const stops = stripes.map(
    (color, index) => `${color} ${index * step}% ${(index + 1) * step}%`,
  );
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

function SwatchGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="theme-picker-group" role="group" aria-labelledby={id}>
      <span id={id} className="theme-picker-label">
        {label}
      </span>
      <div className="theme-picker-swatches">{children}</div>
    </div>
  );
}

function Swatch({
  id,
  label,
  fill,
  flag,
}: {
  id: ThemeId;
  label: string;
  fill: string;
  flag: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <RadioGroupItem
          value={id}
          className={flag ? "theme-swatch theme-swatch-flag" : "theme-swatch"}
          aria-label={label}
        >
          <span
            className="theme-swatch-fill"
            style={{ "--swatch": fill } as CSSProperties}
          />
        </RadioGroupItem>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
