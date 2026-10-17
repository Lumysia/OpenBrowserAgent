import { errorMessage } from "../../shared/error-message";
import { queryPattern } from "../../shared/text";

// Matches of a query in a long text, each with its offset and the text
// around it, so a reader can go to one with read's offset.

export const TEXT_SEARCH_LIMITS = {
  matches: 20,
  // Characters shown on each side of a match.
  context: 100,
} as const;

export function searchText(
  label: string,
  text: string,
  query: string,
): { text: string; total: number } | { error: string } {
  let pattern: RegExp;
  try {
    pattern = queryPattern(query);
  } catch (error) {
    return { error: `Invalid search ${query}: ${errorMessage(error)}` };
  }
  const shown: string[] = [];
  let total = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) continue;
    total++;
    if (shown.length >= TEXT_SEARCH_LIMITS.matches) continue;
    const start = match.index;
    const end = start + match[0].length;
    const from = Math.max(0, start - TEXT_SEARCH_LIMITS.context);
    const to = Math.min(text.length, end + TEXT_SEARCH_LIMITS.context);
    const around = (part: string) => part.replace(/\s+/g, " ");
    shown.push(
      `@${start}: ${from > 0 ? "…" : ""}${around(text.slice(from, start))}«${around(match[0])}»${around(text.slice(end, to))}${to < text.length ? "…" : ""}`,
    );
  }
  const head = `[${label} | ${total} ${total === 1 ? "match" : "matches"} for ${JSON.stringify(query)} in ${text.length} characters`;
  if (!total)
    return {
      text: `${head}. Try other words or a /regex/, or read it in ranges.]`,
      total,
    };
  const more =
    total > shown.length
      ? `; showing the first ${shown.length}, narrow the search for the rest`
      : "";
  return {
    text: `${head}${more}. To read around one, read with offset (its @ position minus a little).]\n${shown.join("\n")}`,
    total,
  };
}
