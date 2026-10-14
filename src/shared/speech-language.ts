// Which language each part of a text is in, for reading it aloud with a
// fitting voice. The script tells most languages apart without any API;
// Latin-script text asks the browser's language detector (when it is ready)
// and otherwise falls back to the hints. Dependency-free: the page scripts
// import this module.
import { normalizeLanguageTag, primaryLanguage } from "./language-tags";

// Some voices (Chrome's network voices) stop after about 15 seconds of one
// utterance, so long text is read in sentence-sized pieces.
export const SPEECH_CHUNK_CHARS = 200;

// A detector result below this is a guess: the hints know better.
export const SPEECH_DETECTION_CONFIDENCE = 0.6;

// Read for Latin-script text when no hint is written in Latin script.
const LATIN_FALLBACK = "en";

type ScriptInfo = {
  pattern: RegExp;
  // ISO 15924 codes, as in language tags such as zh-Hant or sr-Latn.
  codes: readonly string[];
  // The first one is read when no hint names another.
  languages: readonly string[];
  // Languages that also write this script, but mainly another one.
  alsoReadAs?: readonly string[];
  // Written without spaces: every character counts as a word.
  unspaced?: boolean;
};

const SCRIPTS = {
  han: {
    pattern: /\p{Script=Han}/u,
    codes: ["Hani", "Hans", "Hant"],
    languages: ["zh", "yue", "wuu"],
    // Kanji-only Japanese (勉強) and hanja look like Chinese: a Japanese or
    // Korean hint keeps them in that language.
    alsoReadAs: ["ja", "ko"],
    unspaced: true,
  },
  kana: {
    pattern: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
    codes: ["Jpan", "Hira", "Kana"],
    languages: ["ja"],
    unspaced: true,
  },
  hangul: {
    pattern: /\p{Script=Hangul}/u,
    codes: ["Kore", "Hang"],
    languages: ["ko"],
  },
  cyrillic: {
    pattern: /\p{Script=Cyrillic}/u,
    codes: ["Cyrl"],
    languages: [
      "ru",
      "uk",
      "be",
      "bg",
      "sr",
      "mk",
      "kk",
      "ky",
      "mn",
      "tg",
      "tt",
      "ba",
    ],
  },
  greek: { pattern: /\p{Script=Greek}/u, codes: ["Grek"], languages: ["el"] },
  arabic: {
    pattern: /\p{Script=Arabic}/u,
    codes: ["Arab"],
    languages: ["ar", "fa", "ur", "ps", "ug", "sd", "ckb"],
  },
  hebrew: {
    pattern: /\p{Script=Hebrew}/u,
    codes: ["Hebr"],
    languages: ["he", "iw", "yi"],
  },
  thai: {
    pattern: /\p{Script=Thai}/u,
    codes: ["Thai"],
    languages: ["th"],
    unspaced: true,
  },
  devanagari: {
    pattern: /\p{Script=Devanagari}/u,
    codes: ["Deva"],
    languages: ["hi", "mr", "ne", "sa", "mai", "kok"],
  },
  bengali: {
    pattern: /\p{Script=Bengali}/u,
    codes: ["Beng"],
    languages: ["bn", "as"],
  },
  gurmukhi: {
    pattern: /\p{Script=Gurmukhi}/u,
    codes: ["Guru"],
    languages: ["pa"],
  },
  gujarati: {
    pattern: /\p{Script=Gujarati}/u,
    codes: ["Gujr"],
    languages: ["gu"],
  },
  oriya: { pattern: /\p{Script=Oriya}/u, codes: ["Orya"], languages: ["or"] },
  tamil: { pattern: /\p{Script=Tamil}/u, codes: ["Taml"], languages: ["ta"] },
  telugu: { pattern: /\p{Script=Telugu}/u, codes: ["Telu"], languages: ["te"] },
  kannada: {
    pattern: /\p{Script=Kannada}/u,
    codes: ["Knda"],
    languages: ["kn"],
  },
  malayalam: {
    pattern: /\p{Script=Malayalam}/u,
    codes: ["Mlym"],
    languages: ["ml"],
  },
  sinhala: {
    pattern: /\p{Script=Sinhala}/u,
    codes: ["Sinh"],
    languages: ["si"],
  },
  georgian: {
    pattern: /\p{Script=Georgian}/u,
    codes: ["Geor"],
    languages: ["ka"],
  },
  armenian: {
    pattern: /\p{Script=Armenian}/u,
    codes: ["Armn"],
    languages: ["hy"],
  },
  khmer: {
    pattern: /\p{Script=Khmer}/u,
    codes: ["Khmr"],
    languages: ["km"],
    unspaced: true,
  },
  lao: {
    pattern: /\p{Script=Lao}/u,
    codes: ["Laoo"],
    languages: ["lo"],
    unspaced: true,
  },
  myanmar: {
    pattern: /\p{Script=Myanmar}/u,
    codes: ["Mymr"],
    languages: ["my"],
    unspaced: true,
  },
  ethiopic: {
    pattern: /\p{Script=Ethiopic}/u,
    codes: ["Ethi"],
    languages: ["am", "ti"],
  },
  tibetan: {
    pattern: /\p{Script=Tibetan}/u,
    codes: ["Tibt"],
    languages: ["bo"],
  },
  // Any language not listed above.
  latin: { pattern: /\p{Script=Latin}/u, codes: ["Latn"], languages: [] },
} satisfies Record<string, ScriptInfo>;

export type SpeechScript = keyof typeof SCRIPTS;

const SCRIPT_ENTRIES = Object.entries(SCRIPTS) as [SpeechScript, ScriptInfo][];

// A run of text in one script. Spaces, digits and punctuation belong to the
// run they follow; `script` is undefined when the text has no letters.
export type ScriptRun = { text: string; script?: SpeechScript };

// What to read, and the languages it is likely in, most likely first: the
// text's own known language, then the page's, then the UI language.
export type SpeechSegment = { text: string; hints: (string | undefined)[] };

export type SpeechPiece = { text: string; lang: string };

// What the browser's LanguageDetector returns: ranked guesses.
export type LanguageDetection = {
  detectedLanguage: string;
  confidence: number;
};

export type DetectLanguage = (
  text: string,
) => Promise<readonly LanguageDetection[] | undefined>;

export function charScript(char: string): SpeechScript | undefined {
  return SCRIPT_ENTRIES.find(([, info]) => info.pattern.test(char))?.[0];
}

// The script a language is written in: its script subtag, else the script
// the language is listed under, else Latin.
export function languageScript(tag: string): SpeechScript {
  // Canonical tags write the script subtag as "Hant".
  const code = (normalizeLanguageTag(tag) ?? "")
    .split("-")
    .slice(1)
    .find((part) => /^[A-Z][a-z]{3}$/.test(part));
  const primary = primaryLanguage(tag);
  return (
    SCRIPT_ENTRIES.find(([, info]) =>
      code ? info.codes.includes(code) : info.languages.includes(primary),
    )?.[0] ?? "latin"
  );
}

// Splits text where the script changes. A run too short to matter (a single
// acronym, one word under 4 letters, one kanji) stays with the text around
// it; kanji next to kana are Japanese.
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let lead = "";
  for (const char of text) {
    const script = charScript(char);
    const last = runs.at(-1);
    if (!script) {
      if (last) last.text += char;
      else lead += char;
    } else if (last?.script === script) last.text += char;
    else runs.push({ text: char, script });
  }
  if (!runs.length) return lead.trim() ? [{ text: lead }] : [];
  runs[0].text = lead + runs[0].text;
  for (let changed = true; changed;) {
    changed = false;
    runs.forEach((run, index) => {
      if (
        run.script === "han" &&
        [runs[index - 1], runs[index + 1]].some(
          (next) => next?.script === "kana",
        )
      ) {
        run.script = "kana";
        changed = true;
      }
    });
  }
  const merged: ScriptRun[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (!last) merged.push({ ...run });
    else if (last.script === run.script || !significant(run))
      last.text += run.text;
    else if (merged.length === 1 && !significant(last))
      merged[0] = { text: last.text + run.text, script: run.script };
    else merged.push({ ...run });
  }
  return merged;
}

// At least 2 words or 4 letters, and not a single acronym.
function significant({ text, script }: ScriptRun) {
  if (!script) return false;
  const info: ScriptInfo = SCRIPTS[script];
  const letters = [...text].filter((char) => info.pattern.test(char)).length;
  if (info.unspaced) return letters >= 2;
  const words = text
    .split(/\s+/)
    .filter((word) => [...word].some((char) => info.pattern.test(char)));
  if (words.length >= 2) return true;
  const acronym = /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);
  return letters >= 4 && !acronym;
}

export function speechChunks(text: string, size = SPEECH_CHUNK_CHARS) {
  const sentences = text
    .split(/(?<=[.!?;。！？；\n])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let chunk = "";
  for (const sentence of sentences) {
    for (let start = 0; start < sentence.length; start += size) {
      const part = sentence.slice(start, start + size);
      if (chunk && chunk.length + part.length + 1 > size) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk = chunk ? `${chunk} ${part}` : part;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

// The pieces to read, in order, each with its language: sentence-sized
// chunks, split further where the script changes.
export async function speechPieces(
  segments: readonly SpeechSegment[],
  detect?: DetectLanguage,
  size = SPEECH_CHUNK_CHARS,
): Promise<SpeechPiece[]> {
  const pieces: SpeechPiece[] = [];
  for (const segment of segments) {
    const hints = segment.hints.flatMap(
      (hint) => normalizeLanguageTag(hint) ?? [],
    );
    for (const chunk of speechChunks(segment.text, size))
      for (const run of scriptRuns(chunk)) {
        const text = run.text.trim();
        if (text)
          pieces.push({ text, lang: await runLanguage(run, hints, detect) });
      }
  }
  return pieces;
}

async function runLanguage(
  { text, script }: ScriptRun,
  hints: readonly string[],
  detect: DetectLanguage | undefined,
) {
  if (!script) return hints[0] ?? LATIN_FALLBACK;
  if (script !== "latin") {
    const { languages, alsoReadAs = [] } = SCRIPTS[script] as ScriptInfo;
    return (
      hints.find((hint) =>
        [...languages, ...alsoReadAs].includes(primaryLanguage(hint)),
      ) ?? languages[0]
    );
  }
  const detected = detect
    ? pickDetection(await detect(text).catch(() => undefined))
    : undefined;
  if (detected)
    return (
      hints.find(
        (hint) => primaryLanguage(hint) === primaryLanguage(detected),
      ) ?? detected
    );
  return (
    hints.find((hint) => languageScript(hint) === "latin") ?? LATIN_FALLBACK
  );
}

// The detector's best guess if it is sure enough and fits Latin script.
export function pickDetection(
  results: readonly LanguageDetection[] | undefined,
) {
  const best = results?.reduce<LanguageDetection | undefined>(
    (top, result) =>
      !top || result.confidence > top.confidence ? result : top,
    undefined,
  );
  if (!best || best.confidence < SPEECH_DETECTION_CONFIDENCE) return undefined;
  const tag = normalizeLanguageTag(best.detectedLanguage);
  if (!tag || tag === "und" || languageScript(tag) !== "latin")
    return undefined;
  return tag;
}

// The language most of the pieces are in.
export function dominantLanguage(pieces: readonly SpeechPiece[]) {
  const totals = new Map<string, number>();
  for (const { text, lang } of pieces)
    totals.set(lang, (totals.get(lang) ?? 0) + text.length);
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0];
}
