import { useEffect, useRef, useState } from "react";
import type { SubtitleStyle } from "../../src/shared/video-subtitles/style";
import { useLocale, useMessages } from "../../src/ui/messages";
import {
  applySubtitleStyle,
  createSubtitleLayer,
  SUBTITLE_LAYER_CSS,
} from "../../src/video-subtitles/overlay-css";
import { layerPlacement } from "../../src/video-subtitles/placement";

// A sample frame, half bright and half dark, with the subtitle layer the
// pages get (same elements and CSS), sized and placed as over a video of
// this size.
export function SubtitlePreview({ style }: { style: SubtitleStyle }) {
  const frame = useRef<HTMLDivElement>(null);
  const [parts, setParts] = useState<ReturnType<typeof createSubtitleLayer>>();
  const s = useMessages().pageTranslate.subtitles.style;
  const language = useLocale();

  useEffect(() => {
    const host = frame.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.textContent = SUBTITLE_LAYER_CSS;
    const created = createSubtitleLayer();
    shadow.replaceChildren(css, created.layer);
    const place = () => {
      const box = host.getBoundingClientRect();
      const placement = layerPlacement(box, box);
      const { style } = created.layer;
      style.setProperty("--oba-subtitle-size", `${placement.size}px`);
      style.left = "0";
      style.width = `${placement.width}px`;
      style.bottom = `${box.height - placement.bottom}px`;
    };
    const resized = new ResizeObserver(place);
    resized.observe(host);
    setParts(created);
    return () => {
      resized.disconnect();
      shadow.replaceChildren();
    };
  }, []);

  useEffect(() => {
    if (!parts) return;
    parts.original.textContent = s.previewOriginal;
    parts.translation.textContent = s.previewTranslation;
    parts.translation.setAttribute("lang", language);
    applySubtitleStyle(parts.layer, style);
  }, [parts, style, s, language]);

  return (
    <div
      ref={frame}
      className="subtitle-preview"
      role="img"
      aria-label={`${s.preview}: ${s.previewOriginal} ${s.previewTranslation}`}
    />
  );
}
