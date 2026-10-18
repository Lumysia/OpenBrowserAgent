import { ExternalLink, MousePointerClick, Plus, TextQuote } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import { SENT_CONTEXT_PREVIEW_COUNT } from "../../src/shared/config";
import { formatBytes } from "../../src/shared/format";
import { formatCount } from "../../src/shared/i18n";
import { focusTabOrUrl } from "../../src/shared/tab-navigation";
import type {
  AttachmentTab,
  SelectedElement,
  SelectedText,
  UploadedAttachment,
} from "../../src/shared/types";
import { ContextPill, ContextPillList } from "../../src/ui/components";
import { useLocale, useMessages } from "../../src/ui/messages";
import { FileIcon } from "./attachment-file-icon";
import { selectedTextExcerpt } from "./selected-text";

type PillKind = keyof typeof SENT_CONTEXT_PREVIEW_COUNT;
type Pill = { key: string; title: string; node: ReactNode };

const ICON_SIZE = 12;

// What a user message was sent with, as one row of pills under the bubble:
// tabs, files, elements and selected text, each kind cut after its preview
// count with a "+N" pill that shows the rest.
export function SentContextPills({
  tabs,
  attachments,
  missingAttachmentIds,
  elements,
  texts,
}: {
  tabs: AttachmentTab[];
  attachments: UploadedAttachment[];
  missingAttachmentIds: ReadonlySet<string>;
  elements: SelectedElement[];
  texts: SelectedText[];
}) {
  const t = useMessages();
  const locale = useLocale();
  const [expanded, setExpanded] = useState<ReadonlySet<PillKind>>(new Set());
  const groups: Record<PillKind, Pill[]> = {
    tab: tabs.map((tab) => {
      const title = tab.title || t.sidepanel.currentPage;
      return {
        key: `tab-${tab.id}`,
        title,
        node: (
          <ContextPill
            data-kind="tab"
            icon={<ExternalLink size={ICON_SIZE} />}
            imageSrc={tab.favIconUrl}
            label={title}
            tooltip={lines(title, tab.url && siteOf(tab.url))}
            onClick={() =>
              void focusTabOrUrl(tab.id, tab.url).catch(console.warn)
            }
          />
        ),
      };
    }),
    attachment: attachments.map((attachment) => {
      const unavailable = missingAttachmentIds.has(attachment.id);
      return {
        key: `attachment-${attachment.id}`,
        title: attachment.name,
        node: (
          <ContextPill
            data-kind="attachment"
            icon={<FileIcon attachment={attachment} size={ICON_SIZE} />}
            imageSrc={
              attachment.kind === ATTACHMENT_KIND.image
                ? attachment.dataUrl
                : undefined
            }
            imageFill
            label={attachment.name}
            tooltip={lines(
              attachment.name,
              unavailable
                ? t.sidepanel.attachmentUnavailable
                : formatBytes(locale, attachment.size),
            )}
            unavailable={unavailable}
          />
        ),
      };
    }),
    element: elements.map((element, index) => {
      const text = selectedTextExcerpt(
        element.innerText || element.imageAlt || "",
      );
      const tag = element.tagName?.toLowerCase();
      const title = text || tag || t.sidepanel.elementSelected;
      return {
        key: `element-${element.ref || index}`,
        title,
        node: (
          <ContextPill
            data-kind="element"
            icon={<MousePointerClick size={ICON_SIZE} />}
            label={title}
            tooltip={lines(
              t.sidepanel.elementSelected,
              [tag && `<${tag}>`, text].filter(Boolean).join(" "),
            )}
          />
        ),
      };
    }),
    text: texts.map((selection, index) => {
      const title = selectedTextExcerpt(selection.text);
      return {
        key: `text-${index}`,
        title,
        node: (
          <ContextPill
            data-kind="text"
            icon={<TextQuote size={ICON_SIZE} />}
            label={title}
            tooltip={selection.text}
          />
        ),
      };
    }),
  };
  const kinds = Object.keys(groups) as PillKind[];
  if (!kinds.some((kind) => groups[kind].length)) return null;
  return (
    <ContextPillList className="sent-context-pills">
      {kinds.flatMap((kind) => {
        const pills = groups[kind];
        const shown = expanded.has(kind)
          ? pills.length
          : SENT_CONTEXT_PREVIEW_COUNT[kind];
        const hidden = pills.slice(shown);
        return [
          ...pills
            .slice(0, shown)
            .map((pill) => <Fragment key={pill.key}>{pill.node}</Fragment>),
          ...(hidden.length
            ? [
                <ContextPill
                  key={`${kind}-more`}
                  data-kind={kind}
                  label={`+${hidden.length}`}
                  tooltip={lines(...hidden.map((pill) => pill.title))}
                  aria-label={formatCount(
                    t.sidepanel.showMoreContext,
                    hidden.length,
                  )}
                  onClick={() =>
                    setExpanded((current) => new Set(current).add(kind))
                  }
                />,
              ]
            : []),
        ];
      })}
    </ContextPillList>
  );
}

// Tooltip lines (tooltips keep line breaks).
const lines = (...items: (string | undefined)[]) =>
  items.filter(Boolean).join("\n");

const siteOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};
