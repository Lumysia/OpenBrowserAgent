// Text that labels content rather than saying something: dates and times,
// relative times ("3 hours ago"), numbers with units, names and lists of
// names (sources, places, bylines). It is left as it is: its translation
// would read the same or add nothing, and it sits in tight meta rows.
// Dates and relative times are recognized in the page's own language, from
// the browser's date formats.
import { isNameList } from "../shared/page-translate/names";

type DateWords = {
  // Relative times with their numbers as "#" ("# hours ago", "yesterday").
  relative: Set<string>;
  // Month and weekday names and the day's periods ("am").
  words: Set<string>;
};

const UNITS: Intl.RelativeTimeFormatUnit[] = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year",
];
// Numbers that pick each plural form in the languages there are.
const COUNTS = [1, 2, 3, 5, 11, 21, 100];
const STYLES: Intl.RelativeTimeFormatStyle[] = ["long", "short", "narrow"];

const cache = new Map<string, DateWords>();

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/\d+(?:[.,:]\d+)*/g, "#")
    .replace(/\s+/g, " ")
    .trim();

function dateWords(language: string): DateWords {
  const known = cache.get(language);
  if (known) return known;
  const relative = new Set<string>();
  const words = new Set<string>();
  for (const style of STYLES) {
    const always = new Intl.RelativeTimeFormat(language, {
      style,
      numeric: "always",
    });
    const auto = new Intl.RelativeTimeFormat(language, {
      style,
      numeric: "auto",
    });
    for (const unit of UNITS) {
      for (const count of COUNTS) {
        relative.add(normalize(always.format(-count, unit)));
        relative.add(normalize(always.format(count, unit)));
      }
      for (const count of [-1, 0, 1])
        relative.add(normalize(auto.format(count, unit)));
    }
  }
  // Each month, each weekday, each hour of a day.
  const sample = (
    options: Intl.DateTimeFormatOptions,
    count: number,
    date: (index: number) => number,
  ) => {
    const format = new Intl.DateTimeFormat(language, options);
    for (let index = 0; index < count; index++)
      for (const part of format.formatToParts(new Date(date(index))))
        if (part.type !== "literal" && /\p{L}/u.test(part.value))
          words.add(part.value.toLowerCase().replace(/\.$/, ""));
  };
  for (const width of ["long", "short"] as const) {
    sample({ month: width, timeZone: "UTC" }, 12, (index) =>
      Date.UTC(2024, index, 1),
    );
    sample({ weekday: width, timeZone: "UTC" }, 7, (index) =>
      Date.UTC(2024, 0, 1 + index),
    );
  }
  sample({ hour: "numeric", hour12: true, timeZone: "UTC" }, 24, (index) =>
    Date.UTC(2024, 0, 1, index),
  );
  const result = { relative, words };
  cache.set(language, result);
  return result;
}

function wordsOf(language: string) {
  try {
    return dateWords(language);
  } catch {
    // Not a language tag the browser knows.
    return dateWords("en");
  }
}

// Letters in a row that count as a unit after a number ("16°C", "7 km").
const UNIT_MAX_LETTERS = 3;

export type Metadata = "name" | "number" | "date";

// What kind of label the text is, if it is one.
export function metadataOf(
  text: string,
  language = "en",
): Metadata | undefined {
  const trimmed = text.replace(NOTE_MARK, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (isDate(trimmed, language)) return "date";
  if (isNumber(trimmed) || COUNT.test(trimmed)) return "number";
  // A lone short lowercase word is a joint between labels ("and" between
  // two names), not text of its own.
  if (/^\p{Ll}{1,3}$/u.test(trimmed)) return "name";
  if (isNameList(trimmed) || SITE_NAME.test(trimmed) || isLabelRow(trimmed))
    return "name";
  // A label for a value of that kind ("Coordinates: 27°59′N 86°55′E"): the
  // label alone adds little and the value stays as it is.
  const labeled = LABELED.exec(trimmed) ?? WORD_LABELED.exec(trimmed);
  const value = labeled?.[1];
  if (
    value &&
    (isNumber(value) || COUNT.test(value) || isDate(value, language))
  )
    return "number";
  return undefined;
}

// A count of something ("83.4k stars", "+ 726 releases", "1.8B views").
const COUNT = /^[+~]? ?\d[\d.,]*[kmb]?\+? \p{L}+(?: \p{L}+)?$/iu;

// Short labels between separators: a menu or meta row written as text
// ("new | past | comments", "126 points by ann | hide | 29 comments",
// breadcrumbs "Home › News").
const ROW_SEPARATOR = /\s[|·•›»]\s/u;
// Words in a label on average, and in the longest (a byline with a time).
const ROW_LABEL_WORDS = 4;
const ROW_LONGEST_WORDS = 8;

function isLabelRow(trimmed: string) {
  const parts = trimmed.split(ROW_SEPARATOR);
  const words = parts.map((part) => part.split(" ").length);
  return (
    parts.length > 1 &&
    Math.max(...words) <= ROW_LONGEST_WORDS &&
    words.reduce((sum, count) => sum + count, 0) / parts.length <=
      ROW_LABEL_WORDS
  );
}

// Footnote marks ("[2]", "[note 2]", "[a]") aren't part of what the text is.
const NOTE_MARK = /\[[^\][\s][^\][]{0,10}\]/gu;
// "Label: value", the label at most three words; or a one-word label
// without the colon ("Modified 1 month ago", "Viewed 2.0m times").
const WORD_LABELED = /^\p{L}+ (.+)$/u;
const LABELED = /^[^\s:：]+(?: [^\s:：]+){0,2} ?[:：] ?(.+)$/u;

// Whether a translation only changed the labels of the source's values and
// copied the values ("Nepali: सगरमाथा" -> "尼泊尔语：सगरमाथा"): it repeats the
// source and adds little. Labels are "Label:" (at most three words) and
// "(Label)"; every other word of the source is in the translation as it is.
// A translation without a word in it ("-5% $24.69" for a price with a
// hidden label) adds nothing either. Both texts are plain (no markers).
export function addsLittle(source: string, translation: string) {
  if (!/\p{L}/u.test(translation)) return true;
  const left: string[] = [];
  let copied = 0;
  for (const word of source.split(/\s+/).filter(Boolean)) {
    const core = word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
    if (/\p{L}/u.test(core) && translation.includes(core)) copied++;
    else left.push(word);
  }
  return !!copied && LABELS_ONLY.test(left.join(" "));
}

const LABELS_ONLY =
  /^(?: ?(?:[^\s:：()（）]+(?: [^\s:：()（）]+){0,2} ?[:：]|[(（][^()（）]{1,30}[)）]))+$/u;

// A site's name written as its address ("11Alive.com", "news.example.org").
const SITE_NAME = /^[\p{L}\d-]+(\.[\p{L}\d-]+)*\.\p{L}{2,}$/u;

function isNumber(trimmed: string) {
  // A number with units or symbols only.
  return (
    /\d/.test(trimmed) &&
    (trimmed.match(/\p{L}+/gu) || []).every(
      (letters) => letters.length <= UNIT_MAX_LETTERS,
    )
  );
}

function isDate(trimmed: string, language: string) {
  const { relative, words } = wordsOf(language || "en");
  const normalized = normalize(trimmed);
  if (relative.has(normalized)) return true;
  // A date: numbers, month and weekday names, separators.
  const parts = normalized.split(/[\s,./\-–—:]+/).filter(Boolean);
  return (
    parts.length > 0 &&
    parts.some((part) => part !== "#") &&
    parts.every((part) => part === "#" || words.has(part.replace(/\.$/, "")))
  );
}
