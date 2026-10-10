import { readFile } from "node:fs/promises";

// Install a test-only Markdown oracle. Live text stays in the disposable page;
// neither storage contents nor expected HTML cross CDP back to the test runner.
export async function installComposerProbe(page, prompt) {
  const parser = await readFile(
    new URL("./marked.umd.js", import.meta.resolve("marked")),
    "utf8",
  );
  const result = await page.send("Runtime.evaluate", {
    expression: `${parser}\n;(${initializeComposerProbe.toString()})(${JSON.stringify(prompt)})`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error("Composer probe setup failed");
}

async function initializeComposerProbe(prompt) {
  const parse = globalThis.marked.parse;
  const { chats = [] } = await chrome.storage.local.get("chats");
  const baseline = new Set(
    chats.flatMap((chat) => chat.messages || []).map((message) => message.id),
  );
  const normalize = (text) => text.replace(/\s+/gu, " ").trim();
  const structureSelectors = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "em",
    "del",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "br",
  ];
  function projection(root) {
    function text(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (
        node.nodeType !== Node.ELEMENT_NODE &&
        node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
      )
        return "";
      if (node.matches?.(".markdown-code-header, button, [aria-hidden='true']"))
        return "";
      const value = [...node.childNodes].map(text).join("");
      return /^(P|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|TABLE|TR|TH|TD|HR|BR)$/.test(
        node.nodeName,
      )
        ? ` ${value} `
        : value;
    }
    return {
      text: normalize(text(root)),
      structure: structureSelectors.map(
        (selector) => root.querySelectorAll(selector).length,
      ),
      links: [...root.querySelectorAll("a")].map((link) => [
        normalize(link.textContent),
        link.getAttribute("href"),
      ]),
    };
  }
  // Exposed only in this disposable test page, also used by negative controls.
  globalThis.__obaComposerProbe = async () => {
    const { chats = [] } = await chrome.storage.local.get("chats");
    const candidates = chats.flatMap((chat) =>
      (chat.messages || []).flatMap((message, index) =>
        message.role === "user" &&
        !baseline.has(message.id) &&
        message.content === prompt
          ? [{ chat, index }]
          : [],
      ),
    );
    const status = {
      freshUserMessages: candidates.length,
      freshAssistantMessages: 0,
      textCharacters: 0,
      textParts: 0,
      toolParts: 0,
      completedToolParts: 0,
      persistedTextConsistent: false,
      renderedMessageMatched: false,
      renderedTextParts: 0,
      matchedTextParts: 0,
      visibleTextParts: 0,
      expectedCharacters: 0,
      renderedCharacters: 0,
      rawMarkdownMatches: false,
      documentVisible: document.visibilityState === "visible",
      streamActive: !!document.querySelector(".stop-button"),
      revealPending: false,
      answerRendered: false,
    };
    if (candidates.length !== 1) return status;
    const { chat, index } = candidates[0];
    const assistants = chat.messages
      .slice(index + 1)
      .filter(
        (message) => message.role === "assistant" && !baseline.has(message.id),
      );
    status.freshAssistantMessages = assistants.length;
    if (assistants.length !== 1) return status;
    const assistant = assistants[0];
    const parts = (assistant.parts || []).filter(
      (part) => part.type === "text" && part.text?.trim(),
    );
    status.textCharacters = assistant.content?.length || 0;
    status.textParts = parts.length;
    status.toolParts = (assistant.parts || []).filter(
      (part) => part.toolName === "manageTabs",
    ).length;
    status.completedToolParts = (assistant.parts || []).filter(
      (part) =>
        part.toolName === "manageTabs" && part.state === "output-available",
    ).length;
    status.persistedTextConsistent =
      (assistant.parts || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text || "")
        .join("") === assistant.content;
    const bubbles = [
      ...document.querySelectorAll(".messages-content > .message"),
    ];
    const bubble = bubbles[chat.messages.indexOf(assistant)];
    status.renderedMessageMatched =
      bubbles.length === chat.messages.length &&
      bubbles[index]?.querySelector(".user-bubble")?.textContent === prompt &&
      !!bubble &&
      !bubble.classList.contains("user");
    if (!status.renderedMessageMatched) return status;
    const rendered = [
      ...bubble.querySelectorAll(".assistant-text > .markdown"),
    ];
    status.renderedTextParts = rendered.length;
    status.revealPending = !!bubble.querySelector(".assistant-text.streaming");
    status.rawMarkdownMatches =
      parts.length > 0 &&
      parts.every((part) => document.body.innerText.includes(part.text.trim()));
    parts.forEach((part, partIndex) => {
      const template = document.createElement("template");
      template.innerHTML = parse(part.text, { async: false });
      const expected = projection(template.content);
      status.expectedCharacters += expected.text.length;
      const element = rendered[partIndex];
      if (!element) return;
      const visible = element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      });
      if (visible) status.visibleTextParts++;
      const actual = projection(element);
      status.renderedCharacters += actual.text.length;
      if (
        visible &&
        expected.text.length > 0 &&
        JSON.stringify(actual) === JSON.stringify(expected)
      )
        status.matchedTextParts++;
    });
    status.answerRendered =
      !status.streamActive &&
      !status.revealPending &&
      status.textParts > 0 &&
      status.textCharacters > 0 &&
      status.completedToolParts > 0 &&
      status.persistedTextConsistent &&
      status.renderedTextParts === status.textParts &&
      status.matchedTextParts === status.textParts;
    return status;
  };
}

export function composerStatus(page) {
  return page.call(() => globalThis.__obaComposerProbe());
}
