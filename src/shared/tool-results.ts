import {
  CHAT_PART_STATE,
  isToolPartType,
  type ChatPart,
  type ToolModelResult,
  type UploadedAttachment,
} from "./types";

// A tool output's field with the sources it added to the chat (see
// run-tool.ts), read back by extractSourcesFromPart.
export const TOOL_OUTPUT_SOURCES = "_sources";

// What a tool output says of an image moved to the chat's attachments, so
// storage holds no inline data URL. Written by image generation and by
// offloadToolOutputImages, read by the side panel.
export type StoredToolImage = {
  imageAttachmentId: string;
  imageAttachmentName: string;
  imageAttachmentType: string;
  imageAttachmentSize: number;
  imageStored: true;
};

export function storedToolImage(
  attachment: Pick<UploadedAttachment, "id" | "name" | "type" | "size">,
): StoredToolImage {
  return {
    imageAttachmentId: attachment.id,
    imageAttachmentName: attachment.name,
    imageAttachmentType: attachment.type,
    imageAttachmentSize: attachment.size,
    imageStored: true,
  };
}

// Model-facing notes for calls without a recorded result, and the marker
// that stands for an image in exported results.
export const TOOL_RESULT_NOTE = {
  stopped: "[No result: the run stopped before this call finished.]",
  missing: "[No result was recorded for this call.]",
  image: "[image]",
} as const;

// What the model received for a tool call, rebuilt from its chat part.
export function toolModelResult(
  part: ChatPart,
): ToolModelResult & { isError: boolean } {
  const isError = part.state === CHAT_PART_STATE.outputError;
  if (part.result) return { ...part.result, isError };
  const finished = isError || part.state === CHAT_PART_STATE.outputAvailable;
  return {
    text:
      part.error ||
      (finished ? TOOL_RESULT_NOTE.missing : TOOL_RESULT_NOTE.stopped),
    isError: true,
  };
}

// The result as one string: an attached image becomes a marker line.
export function toolResultText(result: ToolModelResult) {
  return result.image
    ? `${result.text}\n${TOOL_RESULT_NOTE.image}`
    : result.text;
}

export function parseToolResultText(text: string): ToolModelResult {
  const marker = `\n${TOOL_RESULT_NOTE.image}`;
  return text.endsWith(marker)
    ? { text: text.slice(0, -marker.length), image: true }
    : { text };
}

// One model response of an assistant turn: its reasoning and text, then the
// tool calls it made. Text after a call, or a call of another response
// (see ChatPart.step), starts the next one.
export type TurnStep = { reasoning: string; text: string; calls: ChatPart[] };

export function turnSteps(parts: ChatPart[]): TurnStep[] {
  const steps: TurnStep[] = [];
  for (const part of parts) {
    let step = steps[steps.length - 1];
    const lastCall = step?.calls[step.calls.length - 1];
    if (
      !step ||
      (lastCall && (!isToolPartType(part.type) || part.step !== lastCall.step))
    ) {
      step = { reasoning: "", text: "", calls: [] };
      steps.push(step);
    }
    if (isToolPartType(part.type)) step.calls.push(part);
    else if (part.type === "text") step.text += part.text || "";
    else if (part.type === "reasoning") step.reasoning += part.text || "";
  }
  return steps;
}
