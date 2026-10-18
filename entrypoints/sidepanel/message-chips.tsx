import { useState } from "react";
import { formatCount } from "../../src/shared/i18n";
import { focusTabOrUrl } from "../../src/shared/tab-navigation";
import type { ChatSource } from "../../src/shared/types";
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

const SOURCE_CHIP_PREVIEW_COUNT = 5;

export function SourceChips({ sources }: { sources: ChatSource[] }) {
  const t = useMessages();
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, sources.length - SOURCE_CHIP_PREVIEW_COUNT);
  const visibleSources = expanded
    ? sources
    : sources.slice(0, SOURCE_CHIP_PREVIEW_COUNT);
  return (
    <div className="source-chip-list">
      {visibleSources.map((source) => (
        <Tooltip key={source.id}>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openSource(source)}
            >
              <Badge>{source.id.replace(/^source_/, "")}</Badge>
              <span>{source.title}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{source.title}</TooltipContent>
        </Tooltip>
      ))}
      {!!hiddenCount && (
        <Button
          variant="secondary"
          size="sm"
          className="source-chip-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t.sidepanel.showFewerSources
            : formatCount(t.sidepanel.showMoreSources, hiddenCount)}
        </Button>
      )}
    </div>
  );
}

function openSource(source: ChatSource) {
  focusTabOrUrl(source.tabId, source.url).catch(console.warn);
}
