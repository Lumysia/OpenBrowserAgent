import type { ReactNode } from "react";
import {
  normalizePageTranslateSettings,
  type PageTranslateSettings,
} from "../../src/shared/page-translate/settings";
import {
  normalizeSmartBarSettings,
  smartBarOnSelection,
  withSmartBarOnSelection,
} from "../../src/shared/smart-bar";
import { storage } from "../../src/shared/storage";
import type { Preferences } from "../../src/shared/types";
import { Card, CardContent, SettingSwitch } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useStoredState } from "../../src/ui/useStoredState";
import {
  SmartBarArt,
  SubtitlesArt,
  TranslateButtonArt,
} from "./setup-illustrations";

type Feature = {
  art: ReactNode;
  title: string;
  description: string;
  get: (preferences: Preferences) => boolean;
  set: (preferences: Preferences, on: boolean) => Preferences;
};

const withPageTranslate = (
  preferences: Preferences,
  change: Partial<PageTranslateSettings>,
): Preferences => ({
  ...preferences,
  pageTranslate: {
    ...normalizePageTranslateSettings(preferences.pageTranslate),
    ...change,
  },
});

// Setup's "On web pages" step: what the extension adds to pages, each a
// switch on the same setting as in Settings → On pages.
export function SetupPagesStep() {
  const t = useMessages();
  const s = t.setup;
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  if (!preferences) return null;
  const features: Feature[] = [
    {
      art: <TranslateButtonArt />,
      title: t.pageTranslate.button.setting,
      description: s.translateButtonDescription,
      get: (value) =>
        normalizePageTranslateSettings(value.pageTranslate).pageButton,
      set: (value, pageButton) => withPageTranslate(value, { pageButton }),
    },
    {
      art: <SmartBarArt />,
      title: s.smartBarTitle,
      description: s.smartBarDescription,
      get: (value) =>
        smartBarOnSelection(normalizeSmartBarSettings(value.smartBar)),
      set: (value, on) => ({
        ...value,
        smartBar: withSmartBarOnSelection(
          normalizeSmartBarSettings(value.smartBar),
          on,
        ),
      }),
    },
    {
      art: <SubtitlesArt />,
      title: t.pageTranslate.subtitles.setting,
      description: s.subtitlesDescription,
      get: (value) =>
        normalizePageTranslateSettings(value.pageTranslate).videoSubtitles,
      set: (value, videoSubtitles) =>
        withPageTranslate(value, { videoSubtitles }),
    },
  ];
  return (
    <div className="setup-features">
      {features.map((feature) => (
        <Card key={feature.title} className="setup-feature">
          <div className="setup-feature-art">{feature.art}</div>
          <CardContent>
            <SettingSwitch
              title={feature.title}
              description={feature.description}
              checked={feature.get(preferences)}
              onChange={(on) =>
                setPreferences((previous) => feature.set(previous, on))
              }
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
