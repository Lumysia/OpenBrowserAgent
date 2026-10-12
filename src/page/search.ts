import { compact } from "./dom";
import { snapshotLines } from "./snapshot";

const LINE_WINDOW = 300;

// Lines of the whole page (no viewport, no item caps) that match `query`:
// plain text (case-insensitive) or /regex/flags.
export function findLines(query: string, limit: number) {
  const matcher = toMatcher(query);
  const { lines } = snapshotLines(document.body, { mode: "all" });
  const matches: string[] = [];
  let total = 0;
  for (const line of lines) {
    const index = matcher(line.text);
    if (index < 0) continue;
    total++;
    if (matches.length < limit) matches.push(window(line.text, index));
  }
  return { matches, total, scanned: lines.length };
}

function toMatcher(query: string): (text: string) => number {
  const regex = query.match(/^\/(.+)\/([a-z]*)$/s);
  if (regex) {
    const pattern = new RegExp(regex[1], regex[2].replace("g", ""));
    return (text) => text.search(pattern);
  }
  const needle = compact(query).toLowerCase();
  return (text) => text.toLowerCase().indexOf(needle);
}

// Keeps the role/ref prefix and a window around the match.
function window(text: string, index: number) {
  if (text.length <= LINE_WINDOW) return text;
  const head = text.slice(0, text.indexOf(":") + 1 || 40);
  const start = Math.max(head.length, index - LINE_WINDOW / 2);
  return `${head} …${text.slice(start, start + LINE_WINDOW)}…`;
}
