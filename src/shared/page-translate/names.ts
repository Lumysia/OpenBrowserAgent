// Names in text written in a script with capital letters: a run of
// capitalized words ("Kimberly Guilfoyle", "The New York Times", "Leo XIV"),
// short lowercase joining words allowed between them ("Bank of America").
// Scripts without case have no such runs.

// A capitalized word, an initial ("A.") or an abbreviation ("Jr.").
const CAPITALIZED = /^[\p{Lu}\p{Lt}][\p{L}\p{M}\d'’.-]*$/u;
// A short lowercase word between two capitalized ones ("of", "de", "van").
const JOINING = /^\p{Ll}{1,3}$/u;
// An initial or a short abbreviation, the only words ending in a full stop.
const ABBREVIATION = /^\p{L}{1,3}\.$/u;
// Capitalized words at most in one name.
export const NAME_MAX_WORDS = 4;

// Whether the whole text is one name: one to four capitalized words, short
// joining words between them, no sentence punctuation.
export function isNameLike(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  let capitalized = 0;
  for (const [index, word] of words.entries()) {
    if (/[.]$/.test(word) && !ABBREVIATION.test(word)) return false;
    if (/[,;:!?]$/.test(word)) return false;
    if (CAPITALIZED.test(word)) capitalized++;
    else if (
      !JOINING.test(word) ||
      index === 0 ||
      index === words.length - 1 ||
      !CAPITALIZED.test(words[index - 1])
    )
      return false;
  }
  return capitalized > 0 && capitalized <= NAME_MAX_WORDS;
}

// Whether the text is a list of names ("By Ann Lee, Bo Chan & Cy Dee"):
// names separated by commas, ampersands, bullets or slashes; in a list, the
// last two may be joined by a short word ("Bo Chan and Cy Dee").
export function isNameList(text: string) {
  const parts = text.split(/\s*[,&;·•|/]\s*/u).filter((part) => part.trim());
  if (parts.length > 1)
    parts.push(...parts.pop()!.split(/\s+\p{Ll}{1,3}\s+(?=[\p{Lu}\p{Lt}])/u));
  return parts.length > 0 && parts.every(isNameLike);
}

// The names in a sentence: runs of two or more capitalized words, and
// single capitalized words that don't start a sentence. Joining words end a
// run here ("Guilfoyle as US" is two names).
export function nameRuns(text: string) {
  const runs = new Set<string>();
  let run: string[] = [];
  let runStartsSentence = false;
  let sentenceStart = true;
  const flush = () => {
    if (run.length >= 2 || (run.length === 1 && !runStartsSentence))
      runs.add(run.join(" "));
    run = [];
  };
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    // Quotes and brackets around a word aren't part of it; an initial or an
    // abbreviation keeps its full stop.
    const core = token.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
    const abbreviation = ABBREVIATION.test(`${core}.`) && /\.$/.test(token);
    const word = abbreviation ? `${core}.` : core;
    if (word && CAPITALIZED.test(word)) {
      if (!run.length) runStartsSentence = sentenceStart;
      run.push(word);
    } else flush();
    // A word ending a clause or a sentence ends the run.
    if (/[,;:!?)"”’]$/u.test(token) || (/\.$/.test(token) && !abbreviation))
      flush();
    sentenceStart = /[.!?:]["”’)]?$/u.test(token) && !abbreviation;
  }
  flush();
  return [...runs].filter((name) => /\p{L}{2}/u.test(name));
}
