import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { marked } from "marked";
import type { Messages } from "../../src/shared/i18n";
import type { ChatSource } from "../../src/shared/types";

export type MarkdownLink = { url: string; title: string; host: string };

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
  const html = marked.parse(renderCitations(text, sources), {
    renderer,
    async: false,
  });
  return {
    html:
      options.animatedFromChar !== undefined
        ? addCharacterFade(html, options.animatedFromChar)
        : html,
    codeBlocks,
  };
}

export function extractMarkdownLinks(text: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const seen = new Set<string>();
  const addLink = (url: string, title = "") => {
    const normalized = cleanUrl(url);
    if (!normalized || seen.has(normalized)) return;
    let host = "";
    try {
      host = new URL(normalized).host;
    } catch {
      return;
    }
    seen.add(normalized);
    links.push({ url: normalized, title: title.trim() || normalized, host });
  };

  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g))
    addLink(match[2], match[1]);
  for (const match of text.matchAll(/(?<!\]\()https?:\/\/[^\s<>)]+/g))
    addLink(match[0]);

  return links;
}

function cleanUrl(url: string) {
  return url.trim().replace(/[\].,!?;:，。！？；：）)]+$/g, "");
}

function mermaidPreview(code: string, language: string, t: Messages) {
  if (!isMermaidLanguage(language)) return "";
  const encoded = encodeMermaidState(code);
  const imageUrl = `https://mermaid.ink/svg/${encoded}?bgColor=FFFFFF`;
  const pngUrl = `https://mermaid.ink/img/${encoded}?type=png&bgColor=FFFFFF`;
  const viewUrl = `https://mermaid.live/view#base64:${encoded}`;
  return `<div class="mermaid-preview-panel"><a class="mermaid-preview ui-skeleton" href="${escapeHtml(viewUrl)}" title="${escapeHtml(t.sidepanel.openMermaidPreview)}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(t.sidepanel.mermaidPreview)}" loading="lazy" /></a><div class="mermaid-preview-actions"><button type="button" class="ui-button ui-button-secondary ui-button-sm" data-mermaid-download-url="${escapeHtml(imageUrl)}" data-mermaid-download-filename="mermaid-diagram.svg">${escapeHtml(t.sidepanel.downloadMermaidSvg)}</button><button type="button" class="ui-button ui-button-secondary ui-button-sm" data-mermaid-download-url="${escapeHtml(pngUrl)}" data-mermaid-download-filename="mermaid-diagram.png">${escapeHtml(t.sidepanel.downloadMermaidPng)}</button></div></div>`;
}

function isMermaidLanguage(language: string) {
  return ["mermaid", "mmd"].includes(language.toLowerCase());
}

function encodeMermaidState(code: string) {
  const state = JSON.stringify({ code, mermaid: { theme: "default" } });
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
      const span = document.createElement("span");
      span.className = "stream-char";
      span.style.setProperty("--char-index", String(animatedIndex));
      span.textContent = character;
      animatedIndex += 1;
      fragment.append(span);
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
  return !!element.closest("pre, code, button, svg");
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
