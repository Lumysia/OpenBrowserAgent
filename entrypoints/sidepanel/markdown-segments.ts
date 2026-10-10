import type { Messages } from "../../src/shared/i18n";
import type { ChatSource } from "../../src/shared/types";
import { renderMarkdown, splitStreamingMarkdown } from "./markdown";

type Options = {
  animatedFromChar?: number;
  incremental: boolean;
  mermaidPreview: boolean;
  syntaxHighlight: boolean;
};

// Each answer owns its derived rendering cache. Retain only the current segments
// and compare every renderer input, including live text, copy state and offsets.
// Earlier blocks still cross the sanitizer; unchanged blocks reuse that result.
export function createMarkdownSegmentRenderer(
  t: Messages,
  sources: ChatSource[],
) {
  let previous = new Map<
    string,
    {
      text: string;
      options: string;
      rendered: ReturnType<typeof renderMarkdown>;
    }
  >();
  return (text: string, copiedCodeId: string | null, options: Options) => {
    const next: typeof previous = new Map();
    const codeBlocks: string[] = [];
    const segments = splitStreamingMarkdown(text, options.incremental).map(
      (segment) => {
        const offset =
          options.animatedFromChar === undefined
            ? undefined
            : Math.max(0, options.animatedFromChar - segment.start);
        // An offset beyond the raw segment cannot animate any rendered character.
        // Normalize it so advancing the reveal cursor does not invalidate history.
        const animatedFromChar =
          offset !== undefined && offset < segment.text.length
            ? offset
            : undefined;
        const renderOptions = {
          animatedFromChar,
          codeIndexOffset: codeBlocks.length,
          mermaidPreview: options.mermaidPreview,
          syntaxHighlight: options.syntaxHighlight,
        };
        const key = JSON.stringify([copiedCodeId, renderOptions]);
        const cached = previous.get(segment.key);
        const rendered =
          cached?.text === segment.text && cached.options === key
            ? cached.rendered
            : renderMarkdown(
                segment.text,
                t,
                copiedCodeId,
                sources,
                renderOptions,
              );
        next.set(segment.key, { text: segment.text, options: key, rendered });
        codeBlocks.push(...rendered.codeBlocks);
        return { key: segment.key, html: rendered.html };
      },
    );
    previous = next;
    return { segments, codeBlocks };
  };
}
