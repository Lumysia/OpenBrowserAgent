import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { Renderer, type Token } from "marked";
import type { Messages } from "../../src/shared/i18n";
import {
  applyStreamingTextRenderer,
  escapeHtml,
  renderMarkdownTokens,
  type MarkdownConfig,
} from "./markdown-engine";
import { renderMarkdownImage } from "./markdown-images";

// DOMPurify's default URI policy plus blob: for images the extension made.
// A blob: URL only resolves in the origin that created it, so a model cannot
// point one at outside data. Set once, without hooks: a config per call or a
// hook makes every sanitize call copy DOMPurify's allow lists.
const SAFE_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const markdownSanitizer = DOMPurify();
markdownSanitizer.setConfig({
  ALLOWED_URI_REGEXP: SAFE_URI,
  FORBID_TAGS: [
    "style",
    "form",
    "textarea",
    "select",
    "iframe",
    "object",
    "embed",
  ],
});

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

type MarkdownRenderOptions = {
  copiedCodeId: string | null;
  loadedImages: readonly string[];
  animatedFromChar?: number;
  mermaidPreview?: boolean;
  syntaxHighlight?: boolean;
};

export function renderMarkdownBlock(
  config: MarkdownConfig,
  tokens: Token[],
  t: Messages,
  options: MarkdownRenderOptions,
) {
  const codeBlocks: string[] = [];
  const renderer = new Renderer();
  if (options.animatedFromChar !== undefined)
    applyStreamingTextRenderer(renderer, options.animatedFromChar);
  renderer.image = ({ href, title, text }) =>
    renderMarkdownImage(href, title, text, t, options.loadedImages);
  renderer.code = ({ text: code, lang }) => {
    const codeIndex = codeBlocks.push(code) - 1;
    const codeId = `code-${codeIndex}`;
    const copied = options.copiedCodeId === codeId;
    const language = lang?.split(/\s+/)[0] || "";
    const highlighted = options.syntaxHighlight
      ? highlightCode(code, language)
      : { html: escapeHtml(code), language };
    const displayLanguage = escapeHtml(
      language || highlighted.language || t.common.plainText,
    );
    const preview = options.mermaidPreview
      ? mermaidSlot(codeIndex, language)
      : "";
    const source = preview
      ? ""
      : `<pre><code class="hljs${language ? ` language-${escapeHtml(language)}` : ""}">${highlighted.html}</code></pre>`;
    const copyLabel = copied ? t.common.copied : t.common.copy;
    return `<div class="markdown-code-block${copied ? " copied" : ""}"><div class="markdown-code-header"><span>${displayLanguage}</span><button type="button" class="code-copy" data-tooltip="${escapeHtml(copyLabel)}" data-code-index="${codeIndex}" data-code-id="${codeId}" aria-label="${escapeHtml(copyLabel)}"><svg class="code-copy-icon code-copy-copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><svg class="code-copy-icon code-copy-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg></button></div>${preview}${source}</div>`;
  };
  const html = markdownSanitizer.sanitize(
    renderMarkdownTokens(config, tokens, renderer),
  );
  return { html, codeBlocks };
}

// A settled Mermaid block becomes a slot the side panel draws the diagram
// into (mermaid-preview.tsx); the source shows only if drawing fails.
function mermaidSlot(codeIndex: number, language: string) {
  if (!MERMAID_LANGUAGES.has(language.toLowerCase())) return "";
  return `<div class="mermaid-preview-panel" data-mermaid-index="${codeIndex}"></div>`;
}

const MERMAID_LANGUAGES = new Set(["mermaid", "mmd"]);

function highlightCode(code: string, language: string) {
  try {
    if (language && hljs.getLanguage(language)) {
      return {
        html: hljs.highlight(code, { language, ignoreIllegals: true }).value,
        language,
      };
    }
    const result = hljs.highlightAuto(code);
    return { html: result.value, language: result.language || "" };
  } catch {
    return { html: escapeHtml(code), language: "" };
  }
}
