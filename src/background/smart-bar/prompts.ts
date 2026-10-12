import {
  SMART_BAR_ACTION,
  type SmartBarGenerateAction,
} from "../../shared/smart-bar";
import type { SmartBarRunRequest } from "../../shared/smart-bar-protocol";

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
    prompt: `${instructions[action]}${contextBlock(context, EDIT_ACTIONS.has(action))}\n\n<text>\n${text}\n</text>`,
  };
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
