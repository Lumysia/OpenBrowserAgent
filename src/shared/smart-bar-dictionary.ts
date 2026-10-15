// Translate on a word or short phrase answers with a dictionary entry. The
// page and the background decide the same way from the selected text, so the
// page knows how to read the answer the background asks for. Dependency-free:
// the page scripts import this module.
import { parseJsonPrefix } from "./json-prefix";
import { SMART_BAR_ACTION, type SmartBarGenerateAction } from "./smart-bar";
import type { SpeechSegment } from "./speech-language";

export const SMART_BAR_RESULT_FORMAT = {
  text: "text",
  dictionary: "dictionary",
} as const;

export type SmartBarResultFormat =
  (typeof SMART_BAR_RESULT_FORMAT)[keyof typeof SMART_BAR_RESULT_FORMAT];

// What counts as a word or short phrase. Scripts written without spaces
// (Chinese, Japanese) count characters; the others count words.
const SMART_BAR_SHORT_SELECTION = {
  maxWords: 4,
  maxUnspacedChars: 8,
  maxChars: 40,
} as const;

const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
// Quotes, brackets and trailing punctuation that come along with a
// double-clicked or dragged word.
const EDGE_PUNCTUATION =
  /^[\p{Ps}\p{Pi}\p{Pf}"']+|[\p{Pe}\p{Pi}\p{Pf}"'.,:、，：]+$/gu;
// A sentence end, or one sentence running into the next.
const SENTENCE_BREAK = /[!?。！？；;…]|[.:：]\s/u;
// A period ends a sentence after more than one word ("She ran home."), not
// after a single word or abbreviation ("Handschuh.", "U.S.").
const FINAL_PERIOD = /\S\s+\S.*\.$/su;

export function isShortSelection(text: string) {
  const { maxWords, maxUnspacedChars, maxChars } = SMART_BAR_SHORT_SELECTION;
  const trimmed = text.trim();
  if (FINAL_PERIOD.test(trimmed)) return false;
  const core = trimmed.replace(EDGE_PUNCTUATION, "");
  if (!core || core.length > maxChars || /\n/.test(core)) return false;
  if (!/\p{L}/u.test(core) || SENTENCE_BREAK.test(trimmed)) return false;
  const unspaced = core.match(UNSPACED)?.length ?? 0;
  if (unspaced > maxUnspacedChars) return false;
  const words = core
    .replace(UNSPACED, " ")
    .split(/\s+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word));
  return words.length <= maxWords;
}

export function smartBarResultFormat(
  action: SmartBarGenerateAction,
  text: string,
): SmartBarResultFormat {
  return action === SMART_BAR_ACTION.translate && isShortSelection(text)
    ? SMART_BAR_RESULT_FORMAT.dictionary
    : SMART_BAR_RESULT_FORMAT.text;
}

type DictionaryExample = { text: string; translation?: string };

// The answer the model gives, as the prompt asks for it. Everything but the
// headword may be missing: the model leaves out what it is unsure about.
export type DictionaryEntry = {
  headword: string;
  pronunciation?: string;
  partOfSpeech?: string;
  contextMeaning?: string;
  otherMeanings: string[];
  examples: DictionaryExample[];
  synonyms: string[];
  collocations: string[];
  translation?: string;
};

type DictionaryReading =
  // Still streaming and nothing to show yet.
  | { kind: "pending" }
  | { kind: "entry"; entry: DictionaryEntry }
  // Not a usable entry: shown as a plain translation.
  | { kind: "text"; text: string };

// Reads a dictionary answer, also while it streams (`complete` false): a
// partial entry shows as far as it got. A finished answer that is no usable
// entry falls back to plain text, never to a broken card.
export function readDictionaryAnswer(
  answer: string,
  complete: boolean,
): DictionaryReading {
  const parsed = parseJsonPrefix(answer);
  const value =
    parsed.kind === "value"
      ? parsed.value
      : complete
        ? embeddedObject(answer)
        : undefined;
  const entry = dictionaryEntry(value);
  if (entry) return { kind: "entry", entry };
  if (!complete && parsed.kind !== "none") return { kind: "pending" };
  const translation = stringField(value, "translation");
  return { kind: "text", text: translation || answer };
}

// An object with text around it ("Here is the entry: {…}").
function embeddedObject(answer: string) {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(answer.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

function dictionaryEntry(value: unknown): DictionaryEntry | undefined {
  const headword = stringField(value, "headword");
  if (!headword) return undefined;
  const record = value as Record<string, unknown>;
  const examples = Array.isArray(record.examples)
    ? record.examples.flatMap((item): DictionaryExample[] => {
        const text =
          typeof item === "string" ? item.trim() : stringField(item, "text");
        if (!text) return [];
        const translation = stringField(item, "translation");
        return [translation ? { text, translation } : { text }];
      })
    : [];
  return {
    headword,
    pronunciation: stringField(value, "pronunciation") || undefined,
    partOfSpeech: stringField(value, "partOfSpeech") || undefined,
    contextMeaning: stringField(value, "contextMeaning") || undefined,
    otherMeanings: stringList(record.otherMeanings),
    examples,
    synonyms: stringList(record.synonyms),
    collocations: stringList(record.collocations),
    translation: stringField(value, "translation") || undefined,
  };
}

function stringField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

// The entry as it is read aloud: the card's parts in its order, each with the
// hints for its language. The headword, examples, synonyms and collocations
// are in the selected text's language; the rest in the entry language. The
// pronunciation is notation (IPA, pinyin), not words to read.
export function dictionarySpeech(
  entry: DictionaryEntry,
  hints: { source: SpeechSegment["hints"]; entry: SpeechSegment["hints"] },
): SpeechSegment[] {
  const source = (text: string) => ({ text, hints: hints.source });
  const own = (text: string) => ({ text, hints: hints.entry });
  const list = (items: string[]) => (items.length ? [items.join(", ")] : []);
  return [
    source(entry.headword),
    ...[
      entry.partOfSpeech,
      entry.contextMeaning,
      ...entry.otherMeanings,
    ].flatMap((text) => (text ? [own(text)] : [])),
    ...entry.examples.flatMap(({ text, translation }) => [
      source(text),
      ...(translation ? [own(translation)] : []),
    ]),
    ...list(entry.synonyms).map(source),
    ...list(entry.collocations).map(source),
  ];
}

export type DictionaryLabels = {
  inContext: string;
  examples: string;
  synonyms: string;
  collocations: string;
};

// The entry as plain text, for Copy and the side panel.
export function dictionaryPlainText(
  entry: DictionaryEntry,
  labels: DictionaryLabels,
) {
  const head = [entry.headword, entry.pronunciation, entry.partOfSpeech]
    .filter(Boolean)
    .join("  ");
  const senses = [
    ...(entry.contextMeaning
      ? [`(${labels.inContext}) ${entry.contextMeaning}`]
      : []),
    ...entry.otherMeanings,
  ].map((sense, index) => `${index + 1}. ${sense}`);
  const list = (label: string, items: string[]) =>
    items.length ? [`${label}: ${items.join(", ")}`] : [];
  const examples = entry.examples.length
    ? [
        `${labels.examples}:`,
        ...entry.examples.map(({ text, translation }) =>
          translation ? `- ${text} (${translation})` : `- ${text}`,
        ),
      ]
    : [];
  return [
    head,
    ...senses,
    ...examples,
    ...list(labels.synonyms, entry.synonyms),
    ...list(labels.collocations, entry.collocations),
  ].join("\n");
}
