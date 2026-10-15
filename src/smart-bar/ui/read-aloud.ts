// What the card's read-aloud buttons read, and the language hints for each
// part: what we know about the text first, then the page's language, then the
// UI language.
import {
  SMART_BAR_ACTION,
  smartBarTranslationLanguage,
  type SmartBarGenerateAction,
} from "../../shared/smart-bar";
import { dictionarySpeech } from "../../shared/smart-bar-dictionary";
import {
  dominantLanguage,
  LANGUAGE_SAMPLE_CHARS,
  speechPieces,
  type DetectLanguage,
  type SpeechPiece,
} from "../../shared/speech-language";
import type { SmartBarOutput } from "./result-output";

export type ReadAloudInput = {
  action: SmartBarGenerateAction;
  source: string;
  output: Pick<SmartBarOutput, "entry" | "write">;
  languages: {
    // The selected text's language as sent with the run, if it was known.
    source?: string;
    // The selection's nearest lang attribute.
    page?: string;
    // What results are written in.
    reply: string;
    ui: string;
  };
};

export function readSourcePieces(
  { source, languages }: ReadAloudInput,
  detect?: DetectLanguage,
): Promise<SpeechPiece[]> {
  return speechPieces(
    [{ text: source, hints: [languages.source, languages.page, languages.ui] }],
    detect,
  );
}

export async function readResultPieces(
  input: ReadAloudInput,
  detect?: DetectLanguage,
): Promise<SpeechPiece[]> {
  const { action, output, languages } = input;
  const hints = (known: string | undefined) => [
    known,
    languages.page,
    languages.ui,
  ];
  if (action === SMART_BAR_ACTION.explain)
    return speechPieces(
      [{ text: output.write, hints: hints(languages.reply) }],
      detect,
    );
  const source = await sourceLanguage(input, detect);
  if (action !== SMART_BAR_ACTION.translate)
    return speechPieces([{ text: output.write, hints: hints(source) }], detect);
  const target = smartBarTranslationLanguage(languages.reply, source);
  return speechPieces(
    output.entry
      ? dictionarySpeech(output.entry, {
          source: hints(source),
          entry: hints(target),
        })
      : [{ text: output.write, hints: hints(target) }],
    detect,
  );
}

// What the run sent, so a translation is read in the language it was asked
// for; else the best guess.
async function sourceLanguage(
  { source, languages }: ReadAloudInput,
  detect?: DetectLanguage,
) {
  if (languages.source) return languages.source;
  return dominantLanguage(
    await speechPieces(
      [
        {
          text: source.slice(0, LANGUAGE_SAMPLE_CHARS),
          hints: [languages.page, languages.ui],
        },
      ],
      detect,
    ),
  );
}
