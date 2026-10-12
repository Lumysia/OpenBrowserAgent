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

export type MarkdownRenderOptions = {
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
      language || highlighted.language || "text",
    );
    const preview = options.mermaidPreview
      ? mermaidPreview(code, language, t)
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

function mermaidPreview(code: string, language: string, t: Messages) {
  if (!isMermaidLanguage(language)) return "";
  const encoded = encodeMermaidState(code);
  const imageUrl = `https://mermaid.ink/svg/${encoded}?bgColor=transparent`;
  const pngUrl = `https://mermaid.ink/img/${encoded}?type=png&bgColor=transparent`;
  const viewUrl = `https://mermaid.live/view#base64:${encoded}`;
  return `<div class="mermaid-preview-panel"><a class="mermaid-preview ui-skeleton" href="${escapeHtml(viewUrl)}" title="${escapeHtml(t.sidepanel.openMermaidPreview)}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(t.sidepanel.mermaidPreview)}" loading="lazy" /></a><div class="mermaid-preview-actions"><button type="button" class="ui-button ui-button-secondary ui-button-sm" data-mermaid-download-url="${escapeHtml(imageUrl)}" data-mermaid-download-filename="mermaid-diagram.svg">${escapeHtml(t.sidepanel.downloadMermaidSvg)}</button><button type="button" class="ui-button ui-button-secondary ui-button-sm" data-mermaid-download-url="${escapeHtml(pngUrl)}" data-mermaid-download-filename="mermaid-diagram.png">${escapeHtml(t.sidepanel.downloadMermaidPng)}</button></div></div>`;
}

function isMermaidLanguage(language: string) {
  return ["mermaid", "mmd"].includes(language.toLowerCase());
}

function encodeMermaidState(code: string) {
  const state = JSON.stringify({
    code,
    mermaid: {
      theme: "base",
      themeVariables: mermaidThemeVariables(),
    },
  });
  const bytes = new TextEncoder().encode(state);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function mermaidThemeVariables() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  const background = color("--card", "#ffffff");
  const text = color("--foreground", "#161512");
  const muted = color("--muted-foreground", "#706d65");
  const accent = color("--accent-soft", "#f7e2ea");
  const accentStrong = color("--accent-strong", "#a35b76");
  const border = color("--border", "#e2e0d8");
  return {
    background,
    mainBkg: background,
    primaryColor: accent,
    primaryTextColor: text,
    primaryBorderColor: accentStrong,
    secondaryColor: color("--secondary", background),
    tertiaryColor: color("--accent-softer", background),
    lineColor: muted,
    textColor: text,
    nodeBorder: accentStrong,
    clusterBkg: background,
    clusterBorder: border,
    edgeLabelBackground: background,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  };
}

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
