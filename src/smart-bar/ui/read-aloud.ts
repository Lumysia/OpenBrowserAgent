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
  speechPieces,
  type DetectLanguage,
  type SpeechPiece,
} from "../../shared/speech-language";
import type { SmartBarOutput } from "./result-output";

// Enough of the selection to tell its language.
const SOURCE_SAMPLE_CHARS = 1000;

export type ReadAloudInput = {
  action: SmartBarGenerateAction;
  source: string;
  output: Pick<SmartBarOutput, "entry" | "write">;
  languages: {
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
    [{ text: source, hints: [languages.page, languages.ui] }],
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

async function sourceLanguage(
  { source, languages }: ReadAloudInput,
  detect?: DetectLanguage,
) {
  return dominantLanguage(
    await speechPieces(
      [
        {
          text: source.slice(0, SOURCE_SAMPLE_CHARS),
          hints: [languages.page, languages.ui],
        },
      ],
      detect,
    ),
  );
}
