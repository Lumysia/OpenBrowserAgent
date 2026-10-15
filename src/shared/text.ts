// Plain-text helpers for page text in any writing system. Dependency-free:
// the page scripts import this module.

// Runs of white space as one space, without leading or trailing space.
export function compact(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

let words: Intl.Segmenter | undefined;

// Words in the text, by the browser's word segmentation: scripts written
// without spaces (Chinese, Japanese, Thai) count their words too, not a
// sentence as one.
export function wordCount(text: string) {
  if (typeof Intl.Segmenter !== "function")
    return text.split(/\s+/).filter(Boolean).length;
  words ??= new Intl.Segmenter(undefined, { granularity: "word" });
  let count = 0;
  for (const segment of words.segment(text)) if (segment.isWordLike) count++;
  return count;
}

// Question marks of the scripts that have their own (Latin and most others,
// Arabic, Armenian, Ethiopic, Limbu, Vai, full-width and small forms of
// Chinese and Japanese, doubled and reversed ones), maybe followed by
// closing quotes and brackets. Greek writes its question mark as a
// semicolon, which can't be told apart from one.
const QUESTION_END =
  /[?\u055E\u061F\u1367\u1945\u2047-\u2049\u2E2E\uA60F\uFE56\uFF1F][\p{Pe}\p{Pf}"']*$/u;

// The text ends in a question mark, in any script.
export function isQuestion(text: string) {
  return QUESTION_END.test(text.trim());
}

// A message with its `{name}` placeholders filled in.
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}
