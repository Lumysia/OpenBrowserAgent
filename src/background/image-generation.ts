import { ATTACHMENT_KIND, base64FromDataUrl } from "../shared/attachments";
import { storage } from "../shared/storage";
import { writeSyncedChatAttachments } from "../shared/sync-chat-attachments";
import type { UploadedAttachment } from "../shared/types";
import { resolveImageModel } from "./model-resolver";

const DEFAULT_IMAGE_SIZE = "1024x1024";
const MIN_IMAGE_PIXELS = 655_360;
const MAX_IMAGE_PIXELS = 8_294_400;
const MAX_IMAGE_EDGE = 3840;
const IMAGE_SIZE_MULTIPLE = 16;
const MAX_IMAGE_ASPECT_RATIO = 3;

export async function generateImage(
  attachments: UploadedAttachment[],
  input: Record<string, unknown>,
  context: {
    chatId?: string;
    messageId?: string;
    toolCallId?: string;
  } = {},
) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return { success: false, error: "Missing image prompt" };
  const jobId = context.toolCallId || crypto.randomUUID();
  const preferences = await storage.preferences.get();
  const model = await resolveImageModel(stringInput(input.modelId));
  const requestedSize =
    stringInput(input.size) || preferences.imageGenerationSize;
  const size = normalizeImageSize(requestedSize);
  const references = referenceAttachments(
    attachments,
    input.referenceAttachmentIds,
  );
  const textReferences = references
    .filter((attachment) => attachment.kind === ATTACHMENT_KIND.text)
    .map(
      (attachment) =>
        `Reference text (${attachment.name}):\n${attachment.text || ""}`,
    )
    .join("\n\n");
  const imageReferences = references.filter(
    (attachment) =>
      attachment.kind === ATTACHMENT_KIND.image && attachment.dataUrl,
  );
  const finalPrompt = textReferences
    ? `${prompt}\n\n${textReferences}`
    : prompt;
  const referenceAttachmentIds = references.map((attachment) => attachment.id);
  try {
    const result = imageReferences.length
      ? await editImage(model, finalPrompt, imageReferences[0], input, size)
      : await createImage(model, finalPrompt, input, size);
    const displayResult = await storeGeneratedImageResult(result, {
      jobId,
      chatId: context.chatId,
      messageId: context.messageId,
    });
    const error = stringInput(displayResult.error);
    const output = {
      ...displayResult,
      success: !error,
      jobId,
      prompt: finalPrompt,
      model: model.modelName,
      referenceAttachmentIds,
      requestedSize: requestedSize || undefined,
      size,
    };
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      jobId,
      prompt: finalPrompt,
      model: model.modelName,
      requestedSize: requestedSize || undefined,
      size,
    };
  }
}

async function createImage(
  model: Awaited<ReturnType<typeof resolveImageModel>>,
  prompt: string,
  input: Record<string, unknown>,
  size: string,
) {
  const response = await fetch(
    `${model.baseUrl.replace(/\/$/, "")}/images/generations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.modelName,
        prompt,
        size,
        quality: stringInput(input.quality) || undefined,
        n: numberInput(input.count) || 1,
        response_format: "b64_json",
      }),
    },
  );
  return parseImageResponse(response);
}

async function editImage(
  model: Awaited<ReturnType<typeof resolveImageModel>>,
  prompt: string,
  image: UploadedAttachment,
  input: Record<string, unknown>,
  size: string,
) {
  const form = new FormData();
  form.append("model", model.modelName);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", String(numberInput(input.count) || 1));
  form.append("image", dataUrlFile(image));
  const response = await fetch(
    `${model.baseUrl.replace(/\/$/, "")}/images/edits`,
    {
      method: "POST",
      headers: model.apiKey
        ? { Authorization: `Bearer ${model.apiKey}` }
        : undefined,
      body: form,
    },
  );
  return parseImageResponse(response);
}

async function parseImageResponse(response: Response) {
  if (!response.ok) return { success: false, error: await response.text() };
  const data = await response.json();
  const first = data.data?.[0] || data.images?.[0] || data.image || data;
  const b64 =
    typeof first === "string"
      ? first
      : first.b64_json || first.base64 || first.image_base64;
  const url = typeof first === "string" ? "" : first.url || first.image_url;
  if (!b64 && !url)
    return {
      success: false,
      error: "Image generation response did not include an image",
    };
  return {
    success: true,
    image: b64.startsWith?.("data:")
      ? b64
      : b64
        ? `data:image/png;base64,${b64}`
        : url,
    mimeType: "image/png",
    revisedPrompt: typeof first === "string" ? undefined : first.revised_prompt,
  };
}

function referenceAttachments(
  attachments: UploadedAttachment[],
  value: unknown,
) {
  const ids = Array.isArray(value) ? value.map(String) : [];
  return attachments.filter((attachment) => ids.includes(attachment.id));
}

async function storeGeneratedImageResult(
  result: Record<string, unknown>,
  context: { jobId: string; chatId?: string; messageId?: string },
) {
  const image = stringInput(result.image);
  if (!image.startsWith("data:image/") || !context.chatId || !context.messageId)
    return result;
  const type = image.match(/^data:([^;,]+)/)?.[1] || "image/png";
  const id = context.jobId;
  const attachment: UploadedAttachment = {
    id,
    name: `generated-image.${type.split("/")[1] || "png"}`,
    type,
    size: dataUrlSize(image),
    kind: ATTACHMENT_KIND.image,
    dataUrl: image,
  };
  try {
    await writeSyncedChatAttachments({
      chatId: context.chatId,
      messageId: context.messageId,
      attachments: [attachment],
    });
    const { image: _image, ...rest } = result;
    return {
      ...rest,
      imageAttachmentId: id,
      imageAttachmentName: attachment.name,
      imageAttachmentType: attachment.type,
      imageAttachmentSize: attachment.size,
      imageStored: true,
    };
  } catch (error) {
    return {
      ...result,
      imageStorageError: error instanceof Error ? error.message : String(error),
    };
  }
}

function dataUrlFile(attachment: UploadedAttachment) {
  const [header, base64 = ""] = (attachment.dataUrl || "").split(",");
  const type =
    header.match(/data:([^;]+)/)?.[1] || attachment.type || "image/png";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], attachment.name || "reference.png", { type });
}

function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberInput(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function dataUrlSize(dataUrl: string) {
  return Math.ceil((base64FromDataUrl(dataUrl).length * 3) / 4);
}

function normalizeImageSize(value: string | undefined) {
  const size = value || DEFAULT_IMAGE_SIZE;
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return DEFAULT_IMAGE_SIZE;
  const originalWidth = Number(match[1]);
  const originalHeight = Number(match[2]);
  let width = roundToMultiple(originalWidth, IMAGE_SIZE_MULTIPLE);
  let height = roundToMultiple(originalHeight, IMAGE_SIZE_MULTIPLE);
  if (!Number.isFinite(width) || !Number.isFinite(height))
    return DEFAULT_IMAGE_SIZE;
  if (!validAspectRatio(width, height)) return DEFAULT_IMAGE_SIZE;
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE)
    return DEFAULT_IMAGE_SIZE;
  while (width * height < MIN_IMAGE_PIXELS) {
    const scale = Math.sqrt(MIN_IMAGE_PIXELS / (width * height));
    width = roundUpToMultiple(originalWidth * scale, IMAGE_SIZE_MULTIPLE);
    height = roundUpToMultiple(originalHeight * scale, IMAGE_SIZE_MULTIPLE);
    if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE)
      return DEFAULT_IMAGE_SIZE;
  }
  if (width * height > MAX_IMAGE_PIXELS) return DEFAULT_IMAGE_SIZE;
  return `${width}x${height}`;
}

function roundToMultiple(value: number, multiple: number) {
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function roundUpToMultiple(value: number, multiple: number) {
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

function validAspectRatio(width: number, height: number) {
  return (
    Math.max(width, height) / Math.min(width, height) <= MAX_IMAGE_ASPECT_RATIO
  );
}
