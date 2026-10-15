// One page's names and terms as translated so far: later batches are sent
// with the earlier translations that use the same names, so the model
// writes each name one way across the page. Only the AI engine reads it;
// the free engines translate each text on its own.
import { nameRuns } from "../../shared/page-translate/names";
import { plainText } from "../../shared/page-translate/placeholders";

// An earlier translation on the page, as plain text.
export type TermExample = { source: string; translation: string };

// Names remembered per page; the oldest go first.
export const TERM_MEMORY_NAMES = 300;
// Earlier translations sent with one batch, and their length in all.
export const TERM_EXAMPLES_MAX = 8;
const TERM_EXAMPLES_MAX_CHARS = 1_500;
// Longer texts aren't kept as examples: names are in headlines and short
// sentences, and a long one would crowd the others out.
const EXAMPLE_MAX_CHARS = 300;

// Words in a run looked at for shorter names in it.
const RUN_MAX_WORDS = 6;

// The names in a text, and the names of two or more words inside longer
// runs: "Why Kimberly Guilfoyle" at the start of a sentence holds
// "Kimberly Guilfoyle".
function namesIn(text: string) {
  const names = new Set<string>();
  for (const run of nameRuns(text)) {
    const words = run.split(" ").slice(0, RUN_MAX_WORDS);
    if (words.length === 1) names.add(run);
    for (let start = 0; start < words.length - 1; start++)
      for (let end = start + 2; end <= words.length; end++)
        names.add(words.slice(start, end).join(" "));
  }
  return names;
}

export function createTermMemory() {
  // Each name and the first translation that used it.
  const names = new Map<string, TermExample>();
  return {
    remember(source: string, translation: string) {
      const example = {
        source: plainText(source),
        translation: plainText(translation),
      };
      if (
        !example.translation ||
        example.translation === example.source ||
        example.source.length > EXAMPLE_MAX_CHARS
      )
        return;
      for (const name of namesIn(example.source)) {
        if (names.has(name)) continue;
        names.set(name, example);
        if (names.size > TERM_MEMORY_NAMES)
          names.delete(names.keys().next().value as string);
      }
    },
    // Earlier translations with the names in `sources`, within the limits.
    examples(sources: string[]): TermExample[] {
      const texts = new Set(sources.map(plainText));
      const found = new Set<TermExample>();
      let chars = 0;
      for (const source of texts)
        for (const name of namesIn(source)) {
          const example = names.get(name);
          if (!example || found.has(example) || texts.has(example.source))
            continue;
          const size = example.source.length + example.translation.length;
          if (
            found.size >= TERM_EXAMPLES_MAX ||
            chars + size > TERM_EXAMPLES_MAX_CHARS
          )
            return [...found];
          found.add(example);
          chars += size;
        }
      return [...found];
    },
  };
}

export type TermMemory = ReturnType<typeof createTermMemory>;
