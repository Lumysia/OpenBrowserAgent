import type { Renderer, Tokens } from "marked";
import { escapeHtml } from "./markdown-extensions";

const STREAM_CHAR_ANIMATION_LIMIT = 80;

export function applyStreamingTextRenderer(
  renderer: Renderer,
  animatedFromChar: number,
) {
  let characterIndex = 0;
  let animatedIndex = 0;

  // Marked installs these methods on its own renderer. Nested tokens must use
  // the active receiver's parser, not the original configuration instance.
  renderer.text = function (
    this: Renderer,
    token: Tokens.Text | Tokens.Escape,
  ) {
    if ("tokens" in token && token.tokens)
      return this.parser.parseInline(token.tokens);
    const text = String("text" in token ? token.text : "");
    return Array.from(text)
      .map((character) => {
        const currentIndex = characterIndex++;
        const escaped = escapeHtml(character);
        if (
          currentIndex < animatedFromChar ||
          animatedIndex >= STREAM_CHAR_ANIMATION_LIMIT
        )
          return escaped;
        return `<span class="stream-char" style="--char-index:${animatedIndex++}">${escaped}</span>`;
      })
      .join("");
  };
}
