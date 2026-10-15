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

// Words at least in a label that reads as a sentence whatever its end, and
// in one that ends like a sentence.
const SENTENCE_MIN_WORDS = 6;
const STATEMENT_MIN_WORDS = 3;
// A sentence's final punctuation in any script, maybe followed by closing
// quotes and brackets; not an ellipsis ("Loading...").
const SENTENCE_END = /(?<![.\u2026])\p{Sentence_Terminal}[\p{Pe}\p{Pf}"']*$/u;
// A capitalized abbreviation ending the text ("Example Inc."): its full
// stop doesn't end a sentence.
const ABBREVIATION_END = /(?:^|\s)\p{Lu}\p{L}{0,2}\.$/u;

// Whether the text reads as a sentence rather than a label: six words or
// more, a question, or a few words ending in a sentence's final
// punctuation, in any script. "Read more", "Log in" and "© 2026 Example
// Inc." are labels.
export function readsAsSentence(text: string) {
  const trimmed = compact(text);
  if (!trimmed) return false;
  if (isQuestion(trimmed)) return true;
  const words = wordCount(trimmed);
  if (words >= SENTENCE_MIN_WORDS) return true;
  return (
    words >= STATEMENT_MIN_WORDS &&
    SENTENCE_END.test(trimmed) &&
    !ABBREVIATION_END.test(trimmed)
  );
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
