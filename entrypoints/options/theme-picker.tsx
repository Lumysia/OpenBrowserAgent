import type { CSSProperties } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  ACCENT_THEMES,
  normalizeTheme,
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
import { resolveScheme } from "../../src/ui/theme";

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
  const labels: Record<(typeof ACCENT_THEMES)[number], string> = {
    pink: t.options.pinkTheme,
    green: t.options.greenTheme,
    blue: t.options.blueTheme,
    purple: t.options.purpleTheme,
    amber: t.options.amberTheme,
  };
  return (
    <RadioGroup
      className="theme-picker"
      aria-label={t.options.colorScheme}
      value={normalizeTheme(value)}
      onValueChange={(next) => onChange(normalizeTheme(next))}
    >
      <div className="theme-picker-swatches">
        {ACCENT_THEMES.map((id) => (
          <Swatch
            key={id}
            id={id}
            label={labels[id]}
            fill={themeTokens(id, scheme)["accent-solid"]}
          />
        ))}
      </div>
    </RadioGroup>
  );
}

function Swatch({
  id,
  label,
  fill,
  flag = false,
}: {
  id: ThemeId;
  label: string;
  fill: string;
  flag?: boolean;
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
