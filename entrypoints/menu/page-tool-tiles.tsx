import { Captions, Highlighter, Languages } from "lucide-react";
import type {
  PageToolChange,
  PageToolsState,
} from "../../src/shared/page-tools";
import { ToggleTile } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

// The active page's tools as one row of tiles: translate the page (on while
// it is translated; again shows the original), the smart bar on this site,
// and translated subtitles for this page's video. Every tile is always
// there; where it can't work it is unavailable and its tooltip says why.
// `state` undefined while it loads, null without a page.
export function PageToolTiles({
  state,
  change,
}: {
  state: PageToolsState | null | undefined;
  change: (change: PageToolChange) => void;
}) {
  const t = useMessages();
  const labels = t.pageTools;
  const web = !!state?.host;
  // Loading: unavailable, without a reason yet.
  const reason =
    state === undefined ? undefined : web ? undefined : labels.notWebPageReason;
  const subtitlesReason = web && !state?.video ? labels.noVideo : reason;
  return (
    <div className="toolbar-menu-tiles">
      <ToggleTile
        icon={<Languages size={18} />}
        label={labels.translate}
        tooltip={
          reason ??
          (state?.translated
            ? t.pageTranslate.menu.showOriginal
            : t.pageTranslate.menu.translatePage)
        }
        pressed={!!state?.translated}
        unavailable={!web}
        onPressedChange={() => change({ tool: "translate" })}
      />
      <ToggleTile
        icon={<Highlighter size={18} />}
        label={labels.smartBarLabel}
        tooltip={reason ?? labels.smartBar}
        pressed={!!state?.smartBar}
        unavailable={!web}
        onPressedChange={(on) => change({ tool: "smartBar", on })}
      />
      <ToggleTile
        icon={<Captions size={18} />}
        label={labels.subtitlesLabel}
        tooltip={subtitlesReason ?? labels.subtitles}
        pressed={!!state?.subtitles}
        unavailable={!web || !state?.video}
        onPressedChange={(on) => change({ tool: "subtitles", on })}
      />
    </div>
  );
}
