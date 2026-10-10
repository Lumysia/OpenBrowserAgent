import type { Api, Message, Model, ImageContent } from "@earendil-works/pi-ai";
import type {
  ChatMessage,
  UploadedAttachment,
  Skill,
  AgentWorkspace,
} from "../shared/types";
import {
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../shared/attachments";
import { renderMessageText } from "./attachment-messages";
import { getUploadedAttachments } from "./message-helpers";
import { assistantMessage } from "./pi-provider";

export function createPiMessages(
  model: Model<Api>,
  messages: ChatMessage[],
  attachments: UploadedAttachment[],
  skills: Skill[],
  workspace?: AgentWorkspace,
): Message[] {
  return messages.map((message, index): Message => {
    const latest = index === messages.length - 1;
    const text = renderMessageText(
      message,
      latest,
      latest ? attachments : [],
      latest ? skills : [],
      latest ? workspace : undefined,
    );
    if (message.role === "assistant")
      return {
        ...assistantMessage(model),
        content: [{ type: "text", text }],
        timestamp: message.createdAt,
      };
    const images = (
      latest && attachments.length
        ? attachments
        : getUploadedAttachments(message)
    )
      .filter(
        (item) =>
          item.kind === "image" &&
          item.dataUrl &&
          isVisionImageMimeType(item.type),
      )
      .map((item) => imageContent(item.dataUrl!, item.type));
    return {
      role: "user",
      timestamp: message.createdAt,
      content: [{ type: "text", text }, ...images],
    };
  });
}

export function imageContent(dataUrl: string, mimeType?: string): ImageContent {
  return {
    type: "image",
    data: base64FromDataUrl(dataUrl),
    mimeType: mimeType || dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png",
  };
}
