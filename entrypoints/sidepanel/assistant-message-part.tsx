import { Check, Copy, ExternalLink, GitBranch } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  COPY_FEEDBACK_MS,
  STREAM_RENDER_THROTTLE_MS,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type { ChatMessage, ChatPart, ChatSource } from "../../src/shared/types";
import { isToolPartType } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import { formatMessageTime } from "./format";
import { IconTooltip } from "./icon-tooltip";
import { extractMarkdownLinks, renderMarkdown } from "./markdown";
import { MessageRunInfo } from "./message-run-info";
import { ToolPart } from "./tool-part";
import { useThrottledText } from "./use-throttled-text";

const LINK_METADATA_MAX_CARDS = 20;

export function AssistantPart({
  t,
  part,
  sources,
  onFork,
  message,
  chatMessages,
}: {
  t: Messages;
  part: ChatPart;
  sources: ChatSource[];
  onFork?: () => void;
  message: ChatMessage;
  chatMessages: ChatMessage[];
}) {
  if (isToolPartType(part.type)) return <ToolPart t={t} part={part} />;
  if (part.type === "text" && part.text?.trim())
    return (
      <AssistantText
        t={t}
        text={part.text}
        sources={sources}
        onFork={onFork}
        message={message}
        chatMessages={chatMessages}
      />
    );
  return null;
}

export function AssistantText({
  t,
  text,
  modelLabel,
  createdAt,
  onFork,
  message,
  chatMessages = [],
  sources = [],
  showRunInfo = false,
}: {
  t: Messages;
  text: string;
  modelLabel?: string;
  createdAt?: number;
  onFork?: () => void;
  message?: ChatMessage;
  chatMessages?: ChatMessage[];
  sources?: ChatSource[];
  showRunInfo?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [linkMetadata, setLinkMetadata] = useState<
    Record<string, LinkMetadata>
  >({});
  const markdownRef = useRef<HTMLDivElement | null>(null);
  const { text: displayText, animatedFrom } = useThrottledText(
    text,
    STREAM_RENDER_THROTTLE_MS,
  );
  const { html, codeBlocks } = renderMarkdown(
    displayText,
    t,
    copiedCodeId,
    sources,
    {
      animatedFromChar:
        displayText.length < text.length ? animatedFrom : undefined,
    },
  );
  const streaming = displayText.length < text.length;
  const linkCards = useMemo(
    () => (streaming ? [] : extractMarkdownLinks(displayText)),
    [displayText, streaming],
  );
  const metadataLinks = useMemo(
    () => linkCards.slice(0, LINK_METADATA_MAX_CARDS),
    [linkCards],
  );
  const metadataLinkKey = metadataLinks.map((link) => link.url).join("\n");

  useEffect(() => {
    if (!metadataLinks.length) return undefined;
    const controller = new AbortController();
    metadataLinks.forEach((link) => {
      const cached = linkMetadataCache.get(link.url);
      if (cached) {
        setLinkMetadata((items) =>
          items[link.url] ? items : { ...items, [link.url]: cached },
        );
        return;
      }
      fetchLinkMetadata(link.url, controller.signal)
        .then((metadata) => {
          setLinkMetadata((items) =>
            items[link.url] ? items : { ...items, [link.url]: metadata },
          );
        })
        .catch((error) => {
          if (controller.signal.aborted || error?.name === "AbortError") return;
          setLinkMetadata((items) => ({
            ...items,
            [link.url]: { title: link.title, icon: "" },
          }));
        });
    });
    return () => controller.abort();
  }, [metadataLinkKey]);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (!copiedCodeId) return undefined;
    const timeout = window.setTimeout(
      () => setCopiedCodeId(null),
      COPY_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [copiedCodeId]);

  useEffect(() => {
    const element = markdownRef.current;
    if (!element) return undefined;
    const handler = (event: MouseEvent) => {
      const citation = (event.target as HTMLElement | null)?.closest(
        "button[data-source-id]",
      ) as HTMLButtonElement | null;
      if (!citation) return;
      event.preventDefault();
      event.stopPropagation();
      openCitationSource(citation.dataset.sourceId || "", sources);
    };
    element.addEventListener("click", handler);
    return () => element.removeEventListener("click", handler);
  }, [sources]);

  async function handleMarkdownClick(event: React.MouseEvent<HTMLDivElement>) {
    const citation = (event.target as HTMLElement | null)?.closest(
      "button[data-source-id]",
    ) as HTMLButtonElement | null;
    if (citation) {
      event.preventDefault();
      event.stopPropagation();
      openCitationSource(citation.dataset.sourceId || "", sources);
      return;
    }
    const mermaidDownload = (event.target as HTMLElement | null)?.closest(
      "button[data-mermaid-download-url]",
    ) as HTMLButtonElement | null;
    if (mermaidDownload?.dataset.mermaidDownloadUrl) {
      event.preventDefault();
      event.stopPropagation();
      await downloadUrlAsFile(
        mermaidDownload.dataset.mermaidDownloadUrl,
        mermaidDownload.dataset.mermaidDownloadFilename ||
          "mermaid-diagram.svg",
      );
      return;
    }
    const button = (event.target as HTMLElement | null)?.closest(
      "button[data-code-index]",
    ) as HTMLButtonElement | null;
    if (!button) {
      const link = (event.target as HTMLElement | null)?.closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link?.href) return;
      event.preventDefault();
      event.stopPropagation();
      await openOrFocusUrl(link.href).catch(() => undefined);
      return;
    }
    const codeIndex = Number(button.dataset.codeIndex);
    const code = codeBlocks[codeIndex];
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedCodeId(button.dataset.codeId || null);
  }

  function copyText() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  return (
    <div className={`assistant-text${streaming ? " streaming" : ""}`}>
      <div
        ref={markdownRef}
        className="markdown"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleMarkdownClick}
      />
      {!!linkCards.length && (
        <div className="assistant-link-cards">
          {linkCards.map((link) => (
            <LinkCard
              key={link.url}
              link={link}
              metadata={linkMetadata[link.url]}
            />
          ))}
        </div>
      )}
      <div className="assistant-actions">
        <div className="message-actions assistant-action-buttons">
          <IconTooltip label={copied ? t.common.copied : t.common.copy}>
            <Button
              variant="ghost"
              size="icon"
              className={`copy-message${copied ? " copied" : ""}`}
              onClick={copyText}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </IconTooltip>
          {onFork && (
            <IconTooltip label={t.sidepanel.forkChat}>
              <Button
                variant="ghost"
                size="icon"
                className="copy-message"
                onClick={onFork}
              >
                <GitBranch />
              </Button>
            </IconTooltip>
          )}
          {showRunInfo && message && (
            <MessageRunInfo
              t={t}
              message={message}
              chatMessages={chatMessages}
            />
          )}
        </div>
        {(modelLabel || createdAt) && (
          <span className="assistant-model-meta">
            {[modelLabel, createdAt ? formatMessageTime(createdAt) : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

type LinkMetadata = { title: string; icon: string };

const linkMetadataCache = new Map<string, LinkMetadata>();

function LinkCard({
  link,
  metadata,
}: {
  link: ReturnType<typeof extractMarkdownLinks>[number];
  metadata?: LinkMetadata;
}) {
  const title = metadata?.title || link.title;
  return (
    <button
      type="button"
      className="assistant-link-card"
      onClick={() => openOrFocusUrl(link.url).catch(() => undefined)}
    >
      <span className="assistant-link-card-icon">
        {metadata?.icon ? (
          <img src={metadata.icon} alt="" loading="lazy" />
        ) : (
          <ExternalLink size={15} />
        )}
      </span>
      <span className="assistant-link-card-text">
        <strong>{title}</strong>
        <small>{link.host}</small>
      </span>
    </button>
  );
}

async function fetchLinkMetadata(url: string, signal: AbortSignal) {
  const cached = linkMetadataCache.get(url);
  if (cached) return cached;
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Unable to fetch link metadata");
  const html = await response.text();
  const document = new DOMParser().parseFromString(html, "text/html");
  const title =
    metaContent(document, "property", "og:title") ||
    metaContent(document, "name", "twitter:title") ||
    document.querySelector("title")?.textContent?.trim() ||
    url;
  const iconHref =
    document
      .querySelector<HTMLLinkElement>(
        'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]',
      )
      ?.getAttribute("href") || "/favicon.ico";
  const icon = new URL(iconHref, url).href;
  const metadata = { title, icon };
  linkMetadataCache.set(url, metadata);
  return metadata;
}

function metaContent(
  document: Document,
  attribute: "name" | "property",
  value: string,
) {
  return document
    .querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`)
    ?.content?.trim();
}

async function downloadUrlAsFile(url: string, filename: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("Unable to download file");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    await chrome.downloads.download({ url: objectUrl, filename });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

function openCitationSource(sourceId: string, sources: ChatSource[]) {
  const source = sources.find((item) => item.id === sourceId);
  if (!source) return;
  if (source.url) {
    openOrFocusUrl(source.url).catch(() => undefined);
    return;
  }
  if (source.tabId) focusTab(source.tabId).catch(() => undefined);
}
