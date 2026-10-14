import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { COPY_FEEDBACK_MS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { getBrowserApi } from "../../src/shared/storage";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type { ChatSource } from "../../src/shared/types";
import { renderMarkdownBlock } from "./markdown";
import {
  splitMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownBlocks,
} from "./markdown-blocks";
import type { MarkdownConfig } from "./markdown-engine";

// Renders an answer as Marked's top-level blocks. While it streams, only the
// last block changes; finished blocks keep their object and skip rendering.
export function MarkdownContent({
  t,
  text,
  sources,
  streaming,
  settled,
  animatedFrom,
}: {
  t: Messages;
  text: string;
  sources: ChatSource[];
  // Text is still being revealed.
  streaming: boolean;
  // The run ended and all text is shown.
  settled: boolean;
  animatedFrom: number;
}) {
  const id = useId();
  const config = useMemo<MarkdownConfig>(
    () => ({
      sources,
      footnoteIdPrefix: `footnote-${id.replace(/[^\w-]/g, "")}-`,
      footnoteHeading: t.sidepanel.footnotes,
      footnoteBackLabel: t.sidepanel.footnoteBackReference.replace(
        "{label}",
        "{0}",
      ),
    }),
    [id, sources, t],
  );
  const blocks = useMarkdownBlocks(config, text, !settled);

  function handleMarkdownImageError(
    event: React.SyntheticEvent<HTMLDivElement>,
  ) {
    const image =
      event.target instanceof HTMLImageElement ? event.target : null;
    const card = image?.closest(".markdown-image-card") as HTMLElement | null;
    if (!image || !card) return;
    card.classList.add("is-broken");
    card.dataset.alt = image.alt || "";
  }

  return (
    <div
      className="markdown ui-selectable"
      onErrorCapture={handleMarkdownImageError}
    >
      {blocks.map((block) => (
        <MarkdownSegment
          key={block.key}
          t={t}
          config={config}
          block={block}
          animatedFromChar={
            streaming && !block.derived && animatedFrom < block.end
              ? Math.max(0, animatedFrom - block.start)
              : undefined
          }
          settled={settled && block.hasCode}
        />
      ))}
    </div>
  );
}

function useMarkdownBlocks(
  config: MarkdownConfig,
  text: string,
  streaming: boolean,
) {
  // A render cache, not state: the previous frame's blocks let the next one
  // lex only new text and keep unchanged block objects, so the memoized
  // segments below skip them. Recomputing gives the same result.
  const previous = useRef<{ config: MarkdownConfig; result: MarkdownBlocks }>(
    undefined,
  );
  return useMemo(() => {
    const cached = previous.current;
    const result = splitMarkdownBlocks(
      config,
      text,
      streaming,
      cached?.config === config ? cached.result : undefined,
    );
    previous.current = { config, result };
    return result.blocks;
  }, [config, text, streaming]);
}

const MarkdownSegment = React.memo(function MarkdownSegment({
  t,
  config,
  block,
  animatedFromChar,
  settled,
}: {
  t: Messages;
  config: MarkdownConfig;
  block: MarkdownBlock;
  animatedFromChar?: number;
  settled: boolean;
}) {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const { html, codeBlocks } = useMemo(
    () =>
      renderMarkdownBlock(config, block.tokens, t, {
        copiedCodeId,
        loadedImages,
        animatedFromChar,
        mermaidPreview: settled,
        syntaxHighlight: settled,
      }),
    [animatedFromChar, block, config, copiedCodeId, loadedImages, settled, t],
  );

  useEffect(() => {
    if (!copiedCodeId) return undefined;
    const timeout = window.setTimeout(
      () => setCopiedCodeId(null),
      COPY_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [copiedCodeId]);

  async function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const citation = target.closest<HTMLElement>("button[data-source-id]");
    const download = target.closest<HTMLElement>(
      "button[data-mermaid-download-url]",
    );
    const copy = target.closest<HTMLElement>("button[data-code-index]");
    const image = target.closest<HTMLElement>("button[data-image-src]");
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!citation && !download && !copy && !image && !link?.href) return;
    event.preventDefault();
    event.stopPropagation();
    if (citation)
      openCitationSource(citation.dataset.sourceId || "", config.sources);
    else if (download)
      await downloadUrlAsFile(
        download.dataset.mermaidDownloadUrl || "",
        download.dataset.mermaidDownloadFilename || "mermaid-diagram.svg",
      );
    else if (copy) {
      const code = codeBlocks[Number(copy.dataset.codeIndex)];
      if (!code) return;
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(copy.dataset.codeId || null);
    } else if (image) {
      const src = image.dataset.imageSrc || "";
      setLoadedImages((current) => [...current, src]);
    } else if (link) {
      const href = link.getAttribute("href") || "";
      // Footnote references and back links point inside the answer.
      if (href.startsWith("#"))
        document
          .getElementById(decodeURIComponent(href.slice(1)))
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      else await openOrFocusUrl(link.href).catch(() => undefined);
    }
  }

  return (
    <div
      className="markdown-segment"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

async function downloadUrlAsFile(url: string, filename: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("Unable to download file");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    await getBrowserApi().downloads.download({ url: objectUrl, filename });
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
