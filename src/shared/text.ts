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
