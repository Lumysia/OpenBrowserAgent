import {
  Captions,
  ChevronDown,
  ChevronRight,
  Highlighter,
  Languages,
  MousePointerClick,
} from "lucide-react";
import { useState } from "react";
import type { PageToolChange } from "../../src/shared/page-tools";
import { Button, ToggleGroup, ToggleGroupItem } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { usePageTools } from "./use-page-tools";

type Tool = "translate" | "pageButton" | "smartBar" | "subtitles";

// One line at the top of the side panel with the active page's switches,
// the same as the toolbar button's right-click menu. Only on web pages.
export function PageToolsStrip() {
  const t = useMessages();
  const { state, change } = usePageTools();
  const [open, setOpen] = useState(true);
  if (!state?.host) return null;
  const labels = t.pageTools;
  const on: Tool[] = [
    ...(state.translated ? (["translate"] as const) : []),
    ...(state.pageButton.on ? (["pageButton"] as const) : []),
    ...(state.smartBar ? (["smartBar"] as const) : []),
    ...(state.subtitles ? (["subtitles"] as const) : []),
  ];
  const toggle = (values: string[]) => {
    const next = new Set(values);
    const tool = (
      ["translate", "pageButton", "smartBar", "subtitles"] as const
    ).find((item) => next.has(item) !== on.includes(item));
    if (!tool) return;
    const request: PageToolChange =
      tool === "translate" ? { tool } : { tool, on: next.has(tool) };
    change(request);
  };
  const translateLabel = state.translated
    ? t.pageTranslate.menu.showOriginal
    : t.pageTranslate.menu.translatePage;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="page-tools-strip">
      <Button
        variant="ghost"
        size="sm"
        className="page-tools-toggle"
        aria-expanded={open}
        aria-label={open ? labels.hide : labels.show}
        onClick={() => setOpen(!open)}
      >
        <Chevron size={14} />
        <span>{labels.title}</span>
      </Button>
      {open && (
        <ToggleGroup
          type="multiple"
          size="sm"
          className="page-tools-switches"
          value={on}
          onValueChange={toggle}
        >
          <ToggleGroupItem
            value="translate"
            aria-label={translateLabel}
            tooltip={translateLabel}
          >
            <Languages size={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="pageButton"
            aria-label={labels.pageButton}
            tooltip={
              state.pageButton.available
                ? labels.pageButton
                : labels.pageButtonOff
            }
            disabled={!state.pageButton.available}
          >
            <MousePointerClick size={15} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="smartBar"
            aria-label={labels.smartBar}
            tooltip={labels.smartBar}
          >
            <Highlighter size={15} />
          </ToggleGroupItem>
          {state.video && (
            <ToggleGroupItem
              value="subtitles"
              aria-label={labels.subtitles}
              tooltip={labels.subtitles}
            >
              <Captions size={15} />
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      )}
    </div>
  );
}
