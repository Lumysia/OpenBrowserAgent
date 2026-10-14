// Reads a JSON object from model output that may still be streaming or be
// wrapped in a Markdown code fence. A cut-off object reads as far as it got:
// open strings and containers are closed, a dangling key or partial literal
// is dropped. Dependency-free: the page scripts import this module.

export type JsonPrefix =
  // Not JSON: the text starts with something else.
  | { kind: "none" }
  // Could still become JSON, but nothing is readable yet.
  | { kind: "incomplete" }
  | { kind: "value"; value: unknown };

const FENCE_OPEN = /^```[\w-]*[^\S\n]*(\n|$)/;
const FENCE = "```json";

export function parseJsonPrefix(input: string): JsonPrefix {
  let text = input.trimStart();
  if (!text) return { kind: "incomplete" };
  const fence = text.match(FENCE_OPEN);
  if (fence) text = text.slice(fence[0].length).trimStart();
  // A fence still arriving ("``", "```js").
  else if (text.startsWith("`"))
    return /^`{1,3}[\w-]*$/.test(text) || FENCE.startsWith(text)
      ? { kind: "incomplete" }
      : { kind: "none" };
  if (!text) return { kind: "incomplete" };
  if (!text.startsWith("{")) return { kind: "none" };
  const end = text.lastIndexOf("}");
  if (end >= 0) {
    try {
      return { kind: "value", value: JSON.parse(text.slice(0, end + 1)) };
    } catch {
      // Cut off, or a "}" inside a string: read the prefix below.
    }
  }
  const closed = closePrefix(text);
  if (closed === undefined) return { kind: "incomplete" };
  try {
    return { kind: "value", value: JSON.parse(closed) };
  } catch {
    return { kind: "incomplete" };
  }
}

type Frame = { close: "}" | "]"; expectKey: boolean };

// The longest prefix of `text` that is valid JSON once its open strings and
// containers are closed; undefined when there is none.
function closePrefix(text: string) {
  const stack: Frame[] = [];
  let safe: string | undefined;
  const closers = () =>
    stack
      .map((frame) => frame.close)
      .reverse()
      .join("");
  const mark = (end: number) => (safe = text.slice(0, end) + closers());
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const frame = stack[stack.length - 1];
    if (char === '"') {
      const isKey = !!frame && frame.close === "}" && frame.expectKey;
      index++;
      let lastWhole = index;
      while (index < text.length && text[index] !== '"') {
        // An escape cut off midway is dropped whole.
        const length =
          text[index] !== "\\" ? 1 : text[index + 1] === "u" ? 6 : 2;
        if (index + length > text.length) {
          index = text.length;
          break;
        }
        index += length;
        lastWhole = index;
      }
      if (index >= text.length) {
        // A value cut off mid-string shows as far as it got.
        if (!isKey && frame) safe = text.slice(0, lastWhole) + '"' + closers();
        return safe;
      }
      index++;
      if (isKey) frame.expectKey = false;
      else mark(index);
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push({ close: char === "{" ? "}" : "]", expectKey: char === "{" });
      index++;
      mark(index);
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      index++;
      mark(index);
      if (!stack.length) return safe;
      continue;
    }
    if (char === ",") {
      if (frame?.close === "}") frame.expectKey = true;
      index++;
      continue;
    }
    if (/[\s:]/.test(char)) {
      index++;
      continue;
    }
    // A number or literal: whole once something follows it.
    const literal = text.slice(index).match(/^[^\s,:\]}"]+/)?.[0] ?? char;
    index += literal.length;
    if (index < text.length) mark(index);
  }
  return safe;
}
