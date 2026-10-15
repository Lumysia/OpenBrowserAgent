// Text that labels content rather than saying something: dates and times,
// relative times ("3 hours ago"), numbers with units, names and lists of
// names (sources, places, bylines). It is left as it is: its translation
// would read the same or add nothing, and it sits in tight meta rows.
// Dates, relative times and compact numbers are recognized in the page's
// own language, from the browser's date and number formats.
import { isNameList } from "../shared/page-translate/names";
import { compact, wordCount } from "../shared/text";

type LocaleWords = {
  // Relative times with their numbers as "#" ("# hours ago", "yesterday").
  relative: Set<string>;
  // Month and weekday names and the day's periods ("am"), longest first.
  words: string[];
  // The suffixes of compact numbers ("k", "mio.", "万"), longest first.
  compact: string[];
  // The words of units and currencies written next to a number ("km",
  // "°C" as "C", "GB", "kr", "USD"), as the browser writes them. Made when
  // first needed: the browser's currency formats are many.
  units: () => Set<string>;
};

// Longest first: "mio." is found before "m", "september" before "sep".
const longestFirst = (words: Set<string>) =>
  [...words].sort((a, b) => b.length - a.length);

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

const cache = new Map<string, LocaleWords>();

const normalize = (text: string) =>
  compact(text.toLowerCase().replace(/\d+(?:[.,:]\d+)*/g, "#"));

// Numbers that pick each compact suffix (thousands to trillions; scripts
// that group by ten thousand have their own).
const COMPACT_SAMPLES = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e12];

function localeWords(language: string): LocaleWords {
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
          words.add(normalize(part.value).replace(/\.$/, ""));
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
  // The words a whole date is written with ("de" in "14 de octubre", "年").
  for (const dateStyle of ["full", "long", "medium"] as const)
    for (const part of new Intl.DateTimeFormat(language, {
      dateStyle,
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(2024, 9, 14))))
      if (part.type === "literal")
        for (const word of normalize(part.value).match(/\p{L}+/gu) || [])
          words.add(word);
  const suffixes = new Set<string>();
  for (const compactDisplay of ["short", "long"] as const) {
    const format = new Intl.NumberFormat(language, {
      notation: "compact",
      compactDisplay,
    });
    for (const sample of COMPACT_SAMPLES)
      for (const part of format.formatToParts(sample))
        if (part.type === "compact") suffixes.add(part.value.toLowerCase());
  }
  const result = {
    relative,
    words: longestFirst(words),
    compact: longestFirst(suffixes),
    units: once(() => unitWords(language)),
  };
  cache.set(language, result);
  return result;
}

function once<T>(make: () => T) {
  let value: T | undefined;
  return () => (value ??= make());
}

// Units and currencies in their short and narrow forms; currency codes as
// they are.
function unitWords(language: string) {
  const units = new Set<string>();
  const supported = (key: "unit" | "currency") =>
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf(key)
      : [];
  const add = (format: Intl.NumberFormat, types: string[]) => {
    for (const part of format.formatToParts(2))
      if (types.includes(part.type))
        for (const word of part.value.match(/\p{L}+/gu) || []) units.add(word);
  };
  for (const unit of supported("unit"))
    for (const unitDisplay of ["short", "narrow"] as const)
      add(
        new Intl.NumberFormat(language, { style: "unit", unit, unitDisplay }),
        ["unit"],
      );
  for (const currency of supported("currency")) {
    units.add(currency);
    for (const currencyDisplay of ["symbol", "narrowSymbol"] as const)
      add(
        new Intl.NumberFormat(language, {
          style: "currency",
          currency,
          currencyDisplay,
        }),
        ["currency"],
      );
  }
  return units;
}

// The languages the page's labels are read in: the page's own, when it
// says; else the user's languages (pages without a language tag are most
// often in one of them). Never one language assumed for every page.
function languagesOf(language: string | undefined) {
  if (language)
    try {
      return Intl.getCanonicalLocales(language);
    } catch {
      // Not a language tag: the user's languages.
    }
  return typeof navigator === "object" ? [...navigator.languages] : [];
}

const merged = new Map<string, LocaleWords>();

function wordsOf(language: string | undefined): LocaleWords {
  const languages = languagesOf(language);
  const key = languages.join(",");
  const known = merged.get(key);
  if (known) return known;
  const relative = new Set<string>();
  const words = new Set<string>();
  const compact = new Set<string>();
  const locales: LocaleWords[] = [];
  for (const tag of languages) {
    let known: LocaleWords;
    try {
      known = localeWords(tag);
    } catch {
      // Not a language the browser knows.
      continue;
    }
    known.relative.forEach((word) => relative.add(word));
    known.words.forEach((word) => words.add(word));
    known.compact.forEach((word) => compact.add(word));
    locales.push(known);
  }
  const result = {
    relative,
    words: longestFirst(words),
    compact: longestFirst(compact),
    units: once(
      () => new Set(locales.flatMap((locale) => [...locale.units()])),
    ),
  };
  merged.set(key, result);
  return result;
}

// Words naming what a count counts ("12 replies", "3 new messages").
const COUNTED_MAX_WORDS = 2;

export type Metadata = "name" | "number" | "date";

type MetadataContext = {
  // The language the text is written in, from the page's markup.
  language?: string;
  // The page sets the text apart as a label: the whole text of a link, a
  // citation or author, or a short row with a date. Rules that read the
  // text's shape alone (a number of things) apply only then: in running
  // text the same shapes are sentences.
  label?: boolean;
  // The page marks the text as a name: a citation or author, a short row
  // with a date (a byline), a line next to a picture (an avatar), a row of
  // links (authors). Capitalized names are told only then: a link's
  // title-case headline ("Getting Started With Sync") has the same shape.
  name?: boolean;
};

// What kind of label the text is, if it is one.
export function metadataOf(
  text: string,
  { language, label = false, name = false }: MetadataContext = {},
): Metadata | undefined {
  const trimmed = compact(text.replace(NOTE_MARK, " "));
  if (!trimmed) return undefined;
  const words = wordsOf(language);
  if (isDate(trimmed, words)) return "date";
  const count = countOf(trimmed, words);
  if (isNumber(trimmed, words) || count === "compact" || (label && count))
    return "number";
  if (SITE_NAME.test(trimmed) || isLabelRow(trimmed)) return "name";
  if (name && isNameList(trimmed)) return "name";
  // A label for a value of that kind ("Coordinates: 27°59′N 86°55′E"): the
  // label alone adds little and the value stays as it is.
  const value = LABELED.exec(trimmed)?.[1];
  if (
    value &&
    (isNumber(value, words) || countOf(value, words) || isDate(value, words))
  )
    return "number";
  return undefined;
}

// A number of things ("12 replies", "+ 726 releases", "1.8B views"):
// `compact` when the number is written in the language's compact notation
// (its own sign of a statistic), `plain` otherwise.
const LEADING_NUMBER = /^[+~]? ?\d[\d.,]*/u;

function countOf(trimmed: string, words: LocaleWords) {
  const number = LEADING_NUMBER.exec(trimmed);
  if (!number) return undefined;
  let rest = trimmed.slice(number[0].length).trimStart();
  const lower = rest.toLowerCase();
  const suffix = words.compact.find(
    (candidate) =>
      lower.startsWith(candidate) &&
      // Scripts with case write the suffix as a word of its own.
      (!/[\p{Lu}\p{Ll}]/u.test(candidate) ||
        !/\p{L}/u.test(lower.charAt(candidate.length))),
  );
  if (suffix) rest = rest.slice(suffix.length);
  rest = rest.replace(/^\+/, "").trim();
  if (!/^[\p{L}\p{M}][\p{L}\p{M} ]*$/u.test(rest)) return undefined;
  if (wordCount(rest) > COUNTED_MAX_WORDS) return undefined;
  return suffix ? "compact" : "plain";
}

// Short labels between separators: a menu or meta row written as text
// ("new | past | comments", "12 points by ann | hide | 3 comments",
// breadcrumbs "Home › News").
const ROW_SEPARATOR = /\s[|·•›»]\s/u;
// Words in a label on average, and in the longest (a byline with a time).
const ROW_LABEL_WORDS = 4;
const ROW_LONGEST_WORDS = 8;

function isLabelRow(trimmed: string) {
  const parts = trimmed.split(ROW_SEPARATOR);
  const words = parts.map(wordCount);
  return (
    parts.length > 1 &&
    Math.max(...words) <= ROW_LONGEST_WORDS &&
    words.reduce((sum, count) => sum + count, 0) / parts.length <=
      ROW_LABEL_WORDS
  );
}

// Footnote marks ("[2]", "[note 2]", "[a]") aren't part of what the text is.
const NOTE_MARK = /\[[^\][\s][^\][]{0,10}\]/gu;
// "Label: value", the label at most three words.
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

// A site's name written as its address ("Example.com", "news.example.org").
const SITE_NAME = /^[\p{L}\d-]+(\.[\p{L}\d-]+)*\.\p{L}{2,}$/u;

// A number with units, currencies or symbols only ("16°C", "7 km", "$24",
// "8,848 m (29,031 ft)"): letters written onto a number ("12th", "4K") are
// part of it, and every other word is a unit, a currency or a compact
// suffix. Other words around a number make it text ("Ep 12: The End", "Day
// 1 of 3"). Scripts written without spaces join numbers and words in one
// token ("この3年間、…"): only a few letters right at a number are part of
// it.
const NUMBER_WITH_LETTERS =
  /(?:(?<!\p{L})\p{L}{1,3})?\d[\d.,]*[°%‰′″]?(?:\p{L}{1,3}(?!\p{L}))?/gu;

function isNumber(trimmed: string, { units, compact }: LocaleWords) {
  if (!/\d/.test(trimmed)) return false;
  return trimmed
    .split(/\s+/)
    .flatMap(
      (token) =>
        token.replace(NUMBER_WITH_LETTERS, " ").match(/\p{L}+/gu) || [],
    )
    .every((word) => compact.includes(word.toLowerCase()) || units().has(word));
}

function isDate(trimmed: string, { relative, words }: LocaleWords) {
  const normalized = normalize(trimmed);
  if (relative.has(normalized)) return true;
  // A date: numbers, month and weekday names, separators. Scripts written
  // without spaces join them ("#月#日星期三").
  const parts = normalized.split(/[\s,./\-–—:]+/).filter(Boolean);
  return (
    parts.some((part) => part !== "#") &&
    parts.every((part) => isDatePart(part.replace(/\.$/, ""), words))
  );
}

// In scripts with case a word is a part of its own; scripts without case
// and spaces join numbers and words in one part ("#月#日星期三").
function isDatePart(part: string, words: string[]) {
  if (part === "#" || words.includes(part)) return true;
  if (/[\p{Lu}\p{Ll}]/u.test(part)) return false;
  let rest = part;
  for (const word of words) rest = rest.split(word).join("");
  return /^#*$/.test(rest);
}
