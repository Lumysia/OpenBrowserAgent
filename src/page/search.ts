import { clip, compact, isHidden } from "./dom";
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

// Organic results of a search engine page: links that carry a heading,
// with the text around them as the snippet.
export function searchResults(limit: number) {
  const host = location.hostname.replace(/^www\./, "");
  const seen = new Set<string>();
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  for (const heading of Array.from(document.querySelectorAll("h2, h3"))) {
    if (isHidden(heading)) continue;
    const link = (heading.closest("a[href]") ||
      heading.querySelector("a[href]")) as HTMLAnchorElement | null;
    if (!link) continue;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const target = url.hostname.replace(/^www\./, "");
    if (target === host || target.endsWith(`.${host}`)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const title = compact(heading.textContent);
    results.push({ title, url: url.href, snippet: snippetFor(link, title) });
    if (results.length >= limit) break;
  }
  return results;
}

function snippetFor(link: Element, title: string) {
  let container: Element = link;
  for (let level = 0; level < 6 && container.parentElement; level++) {
    const parent = container.parentElement;
    if (parent.querySelectorAll("h2, h3").length > 1) break;
    container = parent;
  }
  const text = compact((container as HTMLElement).innerText).replace(title, "");
  return clip(compact(text), 300);
}
