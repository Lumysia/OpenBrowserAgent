import type { CutReason } from "./run-stop";

// Notes and instructions the extension adds to a conversation for the
// model to read. They are English whatever the UI language, like the
// prompts; the prompts of each feature (system prompt, compaction, chat
// titles, smart bar, page translation) live with that feature.

// Text the user did not write, which the model is to follow.
export function internalInstruction(text: string) {
  return `<internal_instruction>\n${text}\n</internal_instruction>`;
}

// Sent (as an internal instruction) when a reply's stream stalls and the
// run is sent again.
export const STALLED_STREAM_RETRY =
  "The previous response stream stalled. Continue from the last completed step, start a new paragraph, do not repeat completed work, and respond in the same language as the user's latest non-internal message.";

// In place of each image of a request sent again without them.
export const IMAGE_OMITTED_NOTE =
  "[Image omitted: the selected model rejected non-text content.]";

// After the messages of a request sent again without images.
export const TEXT_ONLY_INSTRUCTION =
  "The selected model rejected non-text content. Continue using text-only browser inspection and file metadata. Do not request screenshots or media again in this run. If visual evidence is needed, explain the limitation and ask the user to switch to a model that supports images.";

// The answer to a tool call past the run's step limit (declared tools are
// never removed during a run).
export const TOOL_LIMIT_NOTICE =
  "Not executed: the tool step limit for this run is reached. Do not call more tools. Answer now with what you know, say what remains uncertain, and suggest the best next step.";

// Tool steps a run has left, after the tool results of the step that
// brings them low, and after the last one.
export const toolStepsLeftNote = (left: number) =>
  left > 0
    ? `[${left} tool step${left === 1 ? "" : "s"} left: leave room to check the result and answer.]`
    : "[That was the last tool step: answer now with what you know.]";

// After a reply that ended before it was finished, when the chat goes on,
// so the model does not take it as a finished answer.
export const MODEL_STOP_NOTE: Record<CutReason, string> = {
  length:
    "[This reply was cut off here: it reached the output limit before it was finished.]",
  aborted:
    "[This reply was cut off here: the user stopped it before it was finished.]",
  error:
    "[This reply was cut off here: an error ended it before it was finished.]",
};

// The request that checks a model answers (Settings → providers).
export const MODEL_CHECK = {
  system: "You are checking whether this model can respond.",
  prompt: "Reply with exactly: OK",
};
