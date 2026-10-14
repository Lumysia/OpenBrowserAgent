import {
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  TextQuote,
} from "lucide-react";
import { useState } from "react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import {
  SENT_ATTACHMENTS_PREVIEW_COUNT,
  SENT_TABS_PREVIEW_COUNT,
} from "../../src/shared/config";
import { formatCount, type Messages } from "../../src/shared/i18n";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type {
  AttachmentTab,
  ChatSource,
  SelectedText,
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

const SOURCE_CHIP_PREVIEW_COUNT = 5;

export function SourceChips({
  t,
  sources,
}: {
  t: Messages;
  sources: ChatSource[];
}) {
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
  const visibleTabs = tabs.slice(0, SENT_TABS_PREVIEW_COUNT);
  const title = tabs
    .slice(0, SENT_TABS_PREVIEW_COUNT)
    .map((tab) => tab.title || "Current page")
    .join(", ");
  const urls = tabs
    .slice(0, SENT_TABS_PREVIEW_COUNT)
    .map((tab) => tab.url?.replace(/^https?:\/\//, "").replace(/^www\./, ""))
    .filter(Boolean)
    .join(", ");
  const extraCount = tabs.length - visibleTabs.length;
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
      <span>
        <strong>
          {title}
          {extraCount > 0 ? <em>+ {extraCount}</em> : null}
        </strong>
        <small>{urls}</small>
      </span>
    </div>
  );
}

export function SentAttachmentsChip({
  attachments,
  unavailableCount = 0,
  t,
}: {
  attachments: UploadedAttachment[];
  unavailableCount?: number;
  t: Messages;
}) {
  const visibleAttachments = attachments.slice(
    0,
    SENT_ATTACHMENTS_PREVIEW_COUNT,
  );
  const extraCount = attachments.length - visibleAttachments.length;
  const title = visibleAttachments.map((item) => item.name).join(", ");
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
      <span>
        <strong>
          {title}
          {extraCount > 0 ? <em>+ {extraCount}</em> : null}
        </strong>
        <small>
          {unavailableCount
            ? t.sidepanel.unavailableAttachments.replace(
                "{count}",
                String(unavailableCount),
              )
            : t.sidepanel.willBeSentToAi}
        </small>
      </span>
    </div>
  );
}

// The full text shows on hover, like a context card's title.
export function SentSelectedTextChip({
  selection,
  t,
}: {
  selection: SelectedText;
  t: Messages;
}) {
  return (
    <div className="sent-tab-chip" title={selection.text}>
      <TextQuote size={22} />
      <span>
        <strong>{selectedTextExcerpt(selection.text)}</strong>
        <small>{t.sidepanel.selectedText}</small>
      </span>
    </div>
  );
}
