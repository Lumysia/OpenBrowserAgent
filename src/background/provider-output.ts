import {
  assignChatSources,
  extractSourcesFromTool,
} from "../shared/chat-sources";
import type { ChatMessage, ChatSource } from "../shared/types";

export type VisionImage = { dataUrl: string; type?: string };

export function latestUserMessageText(messages: ChatMessage[]) {
  return (
    [...messages].reverse().find((message) => message.role === "user")
      ?.content || ""
  );
}

// Sources this result adds to the run, with their chat-wide ids assigned.
export function newToolSources(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  sources: { current: ChatSource[] },
) {
  if (!output || typeof output !== "object") return [];
  const extracted = extractSourcesFromTool(
    toolName,
    input,
    output as Record<string, unknown>,
  );
  if (!extracted.length) return [];
  const { sources: merged, added } = assignChatSources(
    sources.current,
    extracted,
  );
  sources.current = merged;
  return added;
}

// The side panel keeps full source records for its citation list.
export function withSources(output: unknown, sources: ChatSource[]) {
  if (!sources.length || !output || typeof output !== "object") return output;
  return { ...output, _sources: sources };
}

// The model gets each new source once, as id, title and URL; the page text
// itself is already in the result. Citation rules live in the system prompt.
export function withModelSources(output: unknown, sources: ChatSource[]) {
  if (!sources.length || !output || typeof output !== "object") return output;
  return {
    ...output,
    _sources: sources.map(({ id, title, url }) => ({ id, title, url })),
  };
}

export function extractVisionImage(output: unknown): VisionImage | undefined {
  if (!output || typeof output !== "object") return undefined;
  const image = (output as { _visionImage?: unknown })._visionImage;
  if (!image || typeof image !== "object") return undefined;
  const dataUrl = (image as { dataUrl?: unknown }).dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/"))
    return undefined;
  const type = (image as { type?: unknown }).type;
  return { dataUrl, type: typeof type === "string" ? type : undefined };
}

export function sanitizeToolOutput(output: unknown) {
  if (!output || typeof output !== "object") return output;
  const { _visionImage, ...rest } = output as Record<string, unknown>;
  return _visionImage ? { ...rest, visionImageAttached: true } : output;
}

export function sanitizeToolOutputForModel(output: unknown) {
  const sanitized = sanitizeToolOutput(output);
  if (!output || typeof output !== "object" || !sanitized) return sanitized;
  if (typeof sanitized !== "object") return sanitized;
  const { image, ...rest } = sanitized as Record<string, unknown>;
  if (typeof rest.imageAttachmentId === "string")
    return {
      ...rest,
      imageAvailable: true,
      generatedImageCount: 1,
      note: "Image generation succeeded. The image bytes are available to the UI, but not sent back to the chat model for visual inspection.",
    };
  if (!("_visionImage" in output)) {
    if (typeof image !== "string") return sanitized;
    return {
      ...rest,
      image: image.startsWith("data:image/")
        ? "[generated image is displayed in the chat UI]"
        : image,
      imageAvailable: true,
      generatedImageCount: 1,
      note: "Image generation succeeded. The image bytes are available to the UI, but not sent back to the chat model for visual inspection.",
    };
  }
  return {
    ...rest,
    image: typeof image === "string" ? "[attached as vision image]" : image,
  };
}

export function getMessageSources(messages: ChatMessage[]): ChatSource[] {
  const latest = messages[messages.length - 1];
  return Array.isArray(latest?.metadata?.sources)
    ? (latest.metadata.sources as ChatSource[])
    : [];
}
