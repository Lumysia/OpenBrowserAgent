import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import katex from "katex";
import "katex/dist/katex.min.css";
import { marked } from "marked";
import type { Messages } from "../../src/shared/i18n";
import type { ChatSource } from "../../src/shared/types";

const STREAM_CHAR_ANIMATION_LIMIT = 80;

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

export function renderMarkdown(
  text: string,
  t: Messages,
  copiedCodeId: string | null,
  sources: ChatSource[] = [],
  options: { animatedFromChar?: number; mermaidPreview?: boolean } = {},
) {
  const codeBlocks: string[] = [];
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) =>
    renderMarkdownImage(href, title, text);
  renderer.code = ({ text: code, lang }) => {
    const codeIndex = codeBlocks.push(code) - 1;
    const codeId = `code-${codeIndex}`;
    const copied = copiedCodeId === codeId;
    const language = lang?.split(/\s+/)[0] || "";
    const highlighted = highlightCode(code, language);
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
  const html = enhanceMarkdownHtml(
    marked.parse(renderMath(renderCitations(text, sources)), {
      renderer,
      async: false,
    }),
  );
  return {
    html:
      options.animatedFromChar !== undefined
        ? addCharacterFade(html, options.animatedFromChar)
        : html,
    codeBlocks,
  };
}

function renderMarkdownImage(href: string, title: string | null, text: string) {
  const url = safeImageUrl(href);
  const alt = escapeHtml(text || title || "");
  if (!url) return `<span class="markdown-image-invalid">${alt}</span>`;
  return `<figure class="markdown-image-card"><img src="${escapeHtml(url)}" alt="${alt}" title="${escapeHtml(title || "")}" loading="lazy" referrerpolicy="no-referrer" /><figcaption>${alt}</figcaption></figure>`;
}

function enhanceMarkdownHtml(value: string | Promise<string>) {
  const html = String(value);
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    if (image.closest(".markdown-image-card, .mermaid-preview")) continue;
    const url = safeImageUrl(image.getAttribute("src") || "");
    const alt = image.getAttribute("alt") || image.getAttribute("title") || "";
    if (!url) {
      const fallback = document.createElement("span");
      fallback.className = "markdown-image-invalid";
      fallback.textContent = alt;
      image.replaceWith(fallback);
      continue;
    }
    image.src = url;
    image.alt = alt;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.removeAttribute("style");
    const width = image.getAttribute("width");
    const card = document.createElement("figure");
    card.className = "markdown-image-card";
    if (width && /^\d{1,4}$/.test(width))
      card.style.maxWidth = `min(100%, ${width}px)`;
    const caption = document.createElement("figcaption");
    caption.textContent = alt;
    image.replaceWith(card);
    card.append(image, caption);
  }
  return template.innerHTML;
}

function safeImageUrl(href: string) {
  const value = href.trim();
  if (/^(https?:|data:image\/|blob:)/i.test(value)) return value;
  return "";
}

function renderMath(text: string) {
  const blocks: string[] = [];
  const protectedText = text.replace(/(```[\s\S]*?```|`[^`]*`)/g, (match) => {
    const index = blocks.push(match) - 1;
    return `@@MARKDOWN_PROTECTED_${index}@@`;
  });
  const rendered = protectedText
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) =>
      renderFormula(formula, true),
    )
    .replace(
      /(^|[^\\$])\$([^\n$]+?)\$/g,
      (match, prefix: string, formula: string) => {
        if (!formula.trim()) return match;
        return `${prefix}${renderFormula(formula, false)}`;
      },
    );
  return rendered.replace(
    /@@MARKDOWN_PROTECTED_(\d+)@@/g,
    (_match, index) => blocks[Number(index)] || "",
  );
}

function renderFormula(formula: string, displayMode: boolean) {
  try {
    return katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return escapeHtml(displayMode ? `$$${formula}$$` : `$${formula}$`);
  }
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

function addCharacterFade(html: string, animatedFromChar: number) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const nodes = collectTextNodes(template.content);
  let index = 0;
  let animatedIndex = 0;
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const character of Array.from(node.data)) {
      const characterIndex = index;
      index += 1;
      if (characterIndex < animatedFromChar) {
        fragment.append(character);
        continue;
      }
      if (animatedIndex < STREAM_CHAR_ANIMATION_LIMIT) {
        const span = document.createElement("span");
        span.className = "stream-char";
        span.style.setProperty("--char-index", String(animatedIndex));
        span.textContent = character;
        animatedIndex += 1;
        fragment.append(span);
        continue;
      }
      fragment.append(character);
    }
    node.replaceWith(fragment);
  }
  return template.innerHTML;
}

function collectTextNodes(root: ParentNode) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.textContent || !parent || shouldSkipFade(parent))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function shouldSkipFade(element: Element) {
  return !!element.closest("pre, code, button, svg, .katex");
}

function renderCitations(text: string, sources: ChatSource[]) {
  return text.replace(/\[\[cite:([\w-]+)\]\]/g, (_match, sourceId: string) => {
    const source = sources.find((item) => item.id === sourceId);
    if (!source) return "";
    return `<button type="button" class="citation-chip" data-source-id="${escapeHtml(source.id)}" title="${escapeHtml(source.title)}">${escapeHtml(citationLabel(source.id))}</button>`;
  });
}

function citationLabel(sourceId: string) {
  return sourceId.replace(/^source_/, "");
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
