import { compact } from "../shared/text";
import { snapshotLines } from "./snapshot";

const LINE_WINDOW = 300;

// Lines of the whole page (no viewport, no item caps) that match `query`:
// plain text (case-insensitive) or /regex/flags. `matchingLines` counts the
// lines, `occurrences` every non-overlapping hit in them.
export function findLines(query: string, limit: number) {
  const { lines } = snapshotLines(document.body, { mode: "all" });
  return matchLines(
    lines.map((line) => line.text),
    query,
    limit,
  );
}

export function matchLines(lines: string[], query: string, limit: number) {
  const matcher = toMatcher(query);
  const matches: string[] = [];
  let matchingLines = 0;
  let occurrences = 0;
  for (const text of lines) {
    const { index, count } = matcher(text);
    if (index < 0) continue;
    matchingLines++;
    occurrences += count;
    if (matches.length < limit) matches.push(window(text, index));
  }
  return { matches, matchingLines, occurrences, scanned: lines.length };
}

type Matcher = (text: string) => { index: number; count: number };

function toMatcher(query: string): Matcher {
  const regex = query.match(/^\/(.+)\/([a-z]*)$/s);
  if (regex) {
    const pattern = new RegExp(regex[1], `${regex[2].replace("g", "")}g`);
    return (text) => {
      const hits = [...text.matchAll(pattern)];
      return { index: hits[0]?.index ?? -1, count: hits.length };
    };
  }
  const needle = compact(query).toLowerCase();
  return (text) => {
    const lower = text.toLowerCase();
    const index = lower.indexOf(needle);
    let count = 0;
    if (needle)
      for (
        let at = index;
        at >= 0;
        at = lower.indexOf(needle, at + needle.length)
      )
        count++;
    return { index, count: needle ? count : index < 0 ? 0 : 1 };
  };
}

// Keeps the role/ref prefix and a window around the match.
function window(text: string, index: number) {
  if (text.length <= LINE_WINDOW) return text;
  const head = text.slice(0, text.indexOf(":") + 1 || 40);
  const start = Math.max(head.length, index - LINE_WINDOW / 2);
  return `${head} …${text.slice(start, start + LINE_WINDOW)}…`;
}
