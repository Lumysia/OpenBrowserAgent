import {
  SMART_BAR_ACTION,
  type SmartBarGenerateAction,
} from "../../shared/smart-bar";

const SYSTEM =
  "You are a reading and writing assistant inside a browser toolbar. Return only the requested output: no preamble, no quotes around it, no follow-up questions. Use plain text; short '-' lists are fine, but no Markdown headings, tables or bold.";

// Replies use the extension's language setting, which defaults to the
// browser's UI language.
export function smartBarPrompt(
  action: SmartBarGenerateAction,
  text: string,
  replyLanguage: string,
) {
  const language = languageName(replyLanguage);
  const instructions: Record<SmartBarGenerateAction, string> = {
    [SMART_BAR_ACTION.explain]: `Explain the text below in ${language} so that a non-expert understands it. Be brief: one short paragraph, or a few short points.`,
    [SMART_BAR_ACTION.summarize]: `Summarize the text below in ${language}: one sentence for a short text, otherwise a few short points.`,
    [SMART_BAR_ACTION.translate]: `Translate the text below into ${language}.${
      /English/.test(language)
        ? ""
        : ` If it is already in ${language}, translate it into English instead.`
    } Keep the meaning, tone and line breaks. Return only the translation.`,
    [SMART_BAR_ACTION.improve]:
      "Improve the writing of the text below: make it clearer and more fluent and fix mistakes, keeping its meaning, language, tone, approximate length and line breaks. Return only the improved text.",
    [SMART_BAR_ACTION.fixGrammar]:
      "Fix spelling, grammar and punctuation in the text below. Change nothing else: keep the wording, language, tone and line breaks. Return only the corrected text.",
  };
  return {
    system: SYSTEM,
    prompt: `${instructions[action]}\n\n<text>\n${text}\n</text>`,
  };
}

function languageName(code: string) {
  try {
    // The full tag keeps variants apart (Chinese (Taiwan) vs (China)).
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(
        code.replace("_", "-"),
      ) || "English"
    );
  } catch {
    return "English";
  }
}
