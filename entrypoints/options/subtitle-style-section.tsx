import { useState } from "react";
import { Palette } from "lucide-react";
import { formatNumber } from "../../src/shared/format";
import {
  SUBTITLE_FONT,
  SUBTITLE_OPACITY,
  SUBTITLE_ORIGINAL_COLOR,
  SUBTITLE_SCALES,
  SUBTITLE_TRANSLATION_COLOR,
  type SubtitleStyle,
} from "../../src/shared/video-subtitles/style";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingToggleRow,
  SettingsSection,
  Slider,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useLocale, useMessages } from "../../src/ui/messages";
import { SubtitlePreview } from "./subtitle-preview";

// How translated subtitles look, with a preview of the layer pages show. The
// preview follows the opacity slider as it moves; the setting is saved when
// it is let go.
export function SubtitleStyleSection({
  style,
  onChange,
}: {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}) {
  const s = useMessages().pageTranslate.subtitles.style;
  const language = useLocale();
  const [opacity, setOpacity] = useState<number>();
  const update = (change: Partial<SubtitleStyle>) =>
    onChange({ ...style, ...change });
  const percent = (value: number) =>
    formatNumber(language, value / 100, { style: "percent" });
  const backgroundOpacity = opacity ?? style.backgroundOpacity;
  // One row of presets; `labels` names each of `values`.
  const presets = <K extends keyof SubtitleStyle>(
    key: K,
    title: string,
    values: readonly SubtitleStyle[K][],
    labels: Record<string, string>,
  ) => (
    <SettingToggleRow
      title={title}
      aside={
        <ToggleGroup
          type="single"
          size="sm"
          aria-label={title}
          value={String(style[key])}
          onValueChange={(value) =>
            value && update({ [key]: value } as Partial<SubtitleStyle>)
          }
        >
          {values.map((value) => (
            <ToggleGroupItem key={String(value)} value={String(value)}>
              {labels[String(value)]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    />
  );

  return (
    <SettingsSection
      icon={<Palette />}
      title={s.title}
      description={s.description}
      contentClassName="stack"
    >
      <SubtitlePreview style={{ ...style, backgroundOpacity }} />
      <div className="settings-toggle-list">
        <SettingToggleRow
          title={s.background}
          aside={<span className="muted">{percent(backgroundOpacity)}</span>}
        >
          <Slider
            label={s.background}
            min={SUBTITLE_OPACITY.min}
            max={SUBTITLE_OPACITY.max}
            step={SUBTITLE_OPACITY.step}
            value={[backgroundOpacity]}
            onValueChange={([value]) => setOpacity(value)}
            onValueCommit={([value]) => {
              setOpacity(undefined);
              update({ backgroundOpacity: value });
            }}
          />
        </SettingToggleRow>
        {presets(
          "translationColor",
          s.translationColor,
          Object.values(SUBTITLE_TRANSLATION_COLOR),
          s.colors,
        )}
        {presets(
          "originalColor",
          s.originalColor,
          Object.values(SUBTITLE_ORIGINAL_COLOR),
          s.colors,
        )}
        {presets("font", s.font, Object.values(SUBTITLE_FONT), s.fonts)}
        <SettingToggleRow
          title={s.size}
          aside={
            <Select
              value={String(style.scale)}
              onValueChange={(scale) =>
                update({ scale: Number(scale) as SubtitleStyle["scale"] })
              }
            >
              <SelectTrigger aria-label={s.size}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_SCALES.map((scale) => (
                  <SelectItem key={scale} value={String(scale)}>
                    {percent(scale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingToggleRow
          title={s.showOriginal}
          description={s.showOriginalDescription}
          value={style.showOriginal}
          onChange={(showOriginal) => update({ showOriginal })}
        />
      </div>
    </SettingsSection>
  );
}
