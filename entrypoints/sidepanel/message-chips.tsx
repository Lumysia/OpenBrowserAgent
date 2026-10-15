import {
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  TextQuote,
  MousePointerClick,
} from "lucide-react";
import { useState } from "react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import {
  SENT_ATTACHMENTS_PREVIEW_COUNT,
  SENT_TABS_PREVIEW_COUNT,
} from "../../src/shared/config";
import { formatCount } from "../../src/shared/i18n";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type {
  AttachmentTab,
  ChatSource,
  SelectedText,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { selectedTextExcerpt } from "./selected-text";
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
  if (source.url) {
    openOrFocusUrl(source.url).catch(console.warn);
    return;
  }
  if (source.tabId) focusTab(source.tabId).catch(console.warn);
}

export function SentTabsChip({ tabs }: { tabs: AttachmentTab[] }) {
  const t = useMessages();
  const visibleTabs = tabs.slice(0, SENT_TABS_PREVIEW_COUNT);
  const titleOf = (tab: AttachmentTab) => tab.title || t.sidepanel.currentPage;
  const urls = visibleTabs
    .map((tab) => tab.url?.replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean)
    .join(", ");
  return (
    <div className="sent-tabs-chip">
      <div className="sent-tabs-icons">
        {visibleTabs.map((tab) =>
          tab.favIconUrl ? (
            <img
              key={tab.id}
              src={tab.favIconUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <ExternalLink key={tab.id} size={24} />
          ),
        )}
      </div>
      <SentChipLabel
        titles={tabs.map(titleOf)}
        visibleCount={visibleTabs.length}
        detail={urls}
      />
    </div>
  );
}

export function SentAttachmentsChip({
  attachments,
  unavailableCount = 0,
}: {
  attachments: UploadedAttachment[];
  unavailableCount?: number;
}) {
  const t = useMessages();
  const visibleAttachments = attachments.slice(
    0,
    SENT_ATTACHMENTS_PREVIEW_COUNT,
  );
  return (
    <div className="sent-tabs-chip">
      <div className="sent-tabs-icons">
        {visibleAttachments.map((attachment) =>
          attachment.kind === ATTACHMENT_KIND.image && attachment.dataUrl ? (
            <img
              key={attachment.id}
              src={attachment.dataUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : attachment.kind === ATTACHMENT_KIND.text ? (
            <FileText key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.audio ? (
            <FileAudio key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.video ? (
            <FileVideo key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.document ? (
            <FileText key={attachment.id} size={24} />
          ) : attachment.kind === ATTACHMENT_KIND.image ? (
            <Image key={attachment.id} size={24} />
          ) : (
            <File key={attachment.id} size={24} />
          ),
        )}
      </div>
      <SentChipLabel
        titles={attachments.map((item) => item.name)}
        visibleCount={visibleAttachments.length}
        detail={
          unavailableCount
            ? formatCount(t.sidepanel.unavailableAttachments, unavailableCount)
            : t.sidepanel.willBeSentToAi
        }
      />
    </div>
  );
}

export function SentSelectedTextChip({
  selection,
}: {
  selection: SelectedText;
}) {
  const t = useMessages();
  return (
    <div className="sent-tab-chip">
      <TextQuote size={22} />
      <SentChipLabel
        titles={[selectedTextExcerpt(selection.text)]}
        visibleCount={1}
        detail={t.sidepanel.selectedText}
        tooltip={selection.text}
      />
    </div>
  );
}

export function SentElementsChip({
  elements,
}: {
  elements: SelectedElement[];
}) {
  const t = useMessages();
  return (
    <div className="sent-tab-chip">
      <MousePointerClick size={22} />
      <SentChipLabel
        titles={elements.map(
          (element) => element.tagName || t.sidepanel.elementSelected,
        )}
        visibleCount={1}
      />
    </div>
  );
}

// The names in a sent-context chip: the first few, cut with an ellipsis
// when they do not fit, and every name (or the given full text) in the
// tooltip.
function SentChipLabel({
  titles,
  visibleCount,
  detail,
  tooltip,
}: {
  titles: string[];
  visibleCount: number;
  detail?: string;
  tooltip?: string;
}) {
  const extraCount = titles.length - visibleCount;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="sent-chip-label">
          <strong>
            <span className="sent-chip-title">
              {titles.slice(0, visibleCount).join(", ")}
            </span>
            {extraCount > 0 ? <em>+ {extraCount}</em> : null}
          </strong>
          {detail && <small>{detail}</small>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? titles.join("\n")}</TooltipContent>
    </Tooltip>
  );
}
