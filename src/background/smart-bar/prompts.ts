import {
  SMART_BAR_ACTION,
  type SmartBarGenerateAction,
} from "../../shared/smart-bar";
import {
  SMART_BAR_RESULT_FORMAT,
  smartBarResultFormat,
} from "../../shared/smart-bar-dictionary";
import type { SmartBarRunRequest } from "../../shared/smart-bar-protocol";
import { languageName } from "../../shared/language-name";

// The page script caps context too; this bounds what any message can add.
const CONTEXT_LIMIT = 600;

const SYSTEM =
  "You are a reading and writing assistant inside a browser toolbar. Return only the requested output: no preamble, no quotes around it, no follow-up questions. Use plain text; short '-' lists are fine, but no Markdown headings, tables or bold.";

// Replies use the extension's language setting, which defaults to the
// browser's UI language.
export function smartBarPrompt(
  action: SmartBarGenerateAction,
  text: string,
  replyLanguage: string,
  context?: SmartBarRunRequest["context"],
) {
  const language = languageName(replyLanguage);
  const format = smartBarResultFormat(action, text);
  if (format === SMART_BAR_RESULT_FORMAT.dictionary)
    return {
      system: DICTIONARY_SYSTEM,
      prompt: `${dictionaryInstructions(language)}${contextBlock(context, false)}\n\n<text>\n${text}\n</text>`,
    };
  const instructions: Record<SmartBarGenerateAction, string> = {
    [SMART_BAR_ACTION.explain]: `Explain the text below in ${language} so that a non-expert understands it. Be brief: one short paragraph, or a few short points.`,
    [SMART_BAR_ACTION.translate]: `Translate the text below into ${language}.${englishFallback(
      language,
      "translate it into English instead",
    )} Keep the meaning, tone and line breaks. Return only the translation.`,
    [SMART_BAR_ACTION.improve]:
      "Improve the writing of the text below: make it clearer and more fluent and fix mistakes, keeping its meaning, language, tone, approximate length and line breaks. Return only the improved text.",
    [SMART_BAR_ACTION.fixGrammar]:
      "Fix spelling, grammar and punctuation in the text below. Change nothing else: keep the wording, language, tone and line breaks. Return only the corrected text.",
  };
  return {
    system: SYSTEM,
    prompt: `${instructions[action]}${contextBlock(context, EDIT_ACTIONS.has(action))}\n\n<text>\n${text}\n</text>`,
  };
}

function englishFallback(language: string, instead: string) {
  return /English/.test(language)
    ? ""
    : ` If it is already in ${language}, ${instead}.`;
}

const DICTIONARY_SYSTEM =
  "You are a dictionary inside a browser toolbar. Reply with one JSON object only: no code fence, no text before or after it, no Markdown inside it.";

// Keys in the order the card shows them, so a streaming answer fills the
// card from the top. Read by readDictionaryAnswer.
function dictionaryInstructions(language: string) {
  const entry = /English/.test(language)
    ? `${language}`
    : `${language}, unless the selected text itself is written in ${language}: then English`;
  return [
    `The text below is a word or short phrase (a term, expression, idiom or name) selected on a web page. Write a short dictionary entry for it.`,
    `The entry language is ${entry}. Write every explanation (part of speech, meanings, example translations, translation) in the entry language, whatever language the page or the selected text is in. Only "headword", "examples[].text", "synonyms" and "collocations" stay in the selected text's own language.`,
    "Reply with a JSON object with these keys, in this order:",
    '- "entryLanguage": the entry language you chose, in English (such as "Chinese (China)" or "English").',
    '- "headword": the text in its dictionary form, in the original language and script (the base form if it is inflected, e.g. "ran" becomes "run"; names and fixed expressions stay as written).',
    '- "pronunciation": the headword\'s pronunciation in the usual notation for its language: IPA between slashes for English and other Latin-script languages, pinyin with tone marks for Chinese, the kana reading for Japanese words written with kanji, romanization for Korean. Leave it out for names that are not well known, for Japanese written in kana only, and whenever you are not sure.',
    '- "partOfSpeech": the part of speech, short, in the entry language (such as noun, verb, adjective, phrase, idiom). Leave it out for names.',
    '- "contextMeaning": what the text means here, judged by the context, in the entry language: a short phrase or one sentence. For a name, say what or who it is.',
    '- "otherMeanings": an array of up to 2 other common meanings, in the entry language; an empty array if there are none.',
    '- "examples": an array of 1 or 2 short natural sentences in the original language that use the headword, each {"text": the sentence, "translation": the sentence in the entry language}. Prefer new sentences over repeating the page. Leave out "translation" when the original language is the entry language.',
    '- "synonyms": optional array of up to 3 synonyms in the original language.',
    '- "collocations": optional array of up to 3 common collocations in the original language.',
    '- "translation": the selected text translated into the entry language, as a translator would give it: one short line. Leave it out when the original language is the entry language.',
    "Never invent pronunciations, meanings or examples: leave out any key you are not sure about. Values are plain strings, with no Markdown.",
  ].join("\n");
}

// Their output replaces the selection, so it must cover exactly that text.
const EDIT_ACTIONS = new Set<SmartBarGenerateAction>([
  SMART_BAR_ACTION.improve,
  SMART_BAR_ACTION.fixGrammar,
]);

// Where the text was selected, to understand it by: a selection can cut a
// word ("Top st" in "Top stories") or be a phrase that means something else
// alone. The answer still covers the selected text only.
function contextBlock(
  context: SmartBarRunRequest["context"],
  replacesSelection: boolean,
) {
  if (!context) return "";
  const before = context.before.slice(-CONTEXT_LIMIT);
  const after = context.after.slice(0, CONTEXT_LIMIT);
  const title = context.pageTitle?.slice(0, 200);
  if (!before.trim() && !after.trim() && !title) return "";
  return [
    "",
    "",
    replacesSelection
      ? "The text was selected in a field on a web page; [[SELECTION]] marks its place in the context below. Use the context only to understand the text (topic, tone, the sentence it is part of). Your output replaces exactly the selected text: do not add, complete or repeat anything from the context."
      : "The text was selected on a web page; [[SELECTION]] marks its place in the context below. Use the context only to understand it: if the selection cuts off a word or sentence, read it as the whole word or sentence it belongs to. Work on the selected text only and never repeat the context in the output.",
    "<context>",
    ...(title ? [`Page title: ${title}`] : []),
    `${before}[[SELECTION]]${after}`,
    "</context>",
  ].join("\n");
}
