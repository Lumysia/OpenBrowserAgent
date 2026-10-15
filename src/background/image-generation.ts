import { errorMessage } from "../shared/error-message";
import { ATTACHMENT_KIND, base64FromDataUrl } from "../shared/attachments";
import { storage } from "../shared/storage";
import { writeChatAttachments } from "../shared/chat-attachments";
import type { UploadedAttachment } from "../shared/types";
import { providerApiUrl } from "../shared/provider-urls";
import { clampInt, trimmedString } from "../shared/values";
import { resolveImageModel } from "./model-resolver";

// Size rules of OpenAI's image models, which the images API other
// services copy.
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
  signal?: AbortSignal,
) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return { success: false, error: "Missing image prompt" };
  const jobId = context.toolCallId || crypto.randomUUID();
  const preferences = await storage.preferences.get();
  const model = await resolveImageModel(trimmedString(input.modelId));
  const requestedSize =
    trimmedString(input.size) || preferences.imageGenerationSize;
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
      ? await editImage(
          model,
          finalPrompt,
          imageReferences[0],
          input,
          size,
          signal,
        )
      : await createImage(model, finalPrompt, input, size, signal);
    signal?.throwIfAborted();
    const displayResult = await storeGeneratedImageResult(
      result,
      {
        jobId,
        chatId: context.chatId,
        messageId: context.messageId,
      },
      signal,
    );
    const error = trimmedString(displayResult.error);
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
    signal?.throwIfAborted();
    const message = errorMessage(error);
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
  signal?: AbortSignal,
) {
  const response = await fetch(
    providerApiUrl(model.provider, model.baseUrl, "/images/generations"),
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.modelName,
        prompt,
        size,
        quality: trimmedString(input.quality) || undefined,
        n: imageCount(input.count),
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
  signal?: AbortSignal,
) {
  const form = new FormData();
  form.append("model", model.modelName);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", String(imageCount(input.count)));
  form.append("image", dataUrlFile(image));
  const response = await fetch(
    providerApiUrl(model.provider, model.baseUrl, "/images/edits"),
    {
      method: "POST",
      signal,
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
  const mimeType = b64?.startsWith?.("data:")
    ? b64.slice(5, b64.indexOf(";"))
    : b64
      ? imageTypeOf(b64)
      : "image/png";
  return {
    success: true,
    image: b64?.startsWith?.("data:")
      ? b64
      : b64
        ? `data:${mimeType};base64,${b64}`
        : url,
    mimeType,
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
  signal?: AbortSignal,
) {
  const image = trimmedString(result.image);
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
    await writeChatAttachments({
      chatId: context.chatId,
      messageId: context.messageId,
      attachments: [attachment],
      signal,
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
    signal?.throwIfAborted();
    return {
      ...result,
      imageStorageError: errorMessage(error),
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

// The image type of base64 data, from its first bytes; PNG when unknown.
const IMAGE_SIGNATURES: ReadonlyArray<[prefix: string, type: string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["UklGR", "image/webp"],
  ["R0lGOD", "image/gif"],
];

function imageTypeOf(base64: string) {
  return (
    IMAGE_SIGNATURES.find(([prefix]) => base64.startsWith(prefix))?.[1] ??
    "image/png"
  );
}

function imageCount(value: unknown) {
  return clampInt(value, { fallback: 1, min: 1 });
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
  if (width * height < MIN_IMAGE_PIXELS) {
    const scale = Math.sqrt(MIN_IMAGE_PIXELS / (width * height));
    width = roundUpToMultiple(width * scale, IMAGE_SIZE_MULTIPLE);
    height = roundUpToMultiple(height * scale, IMAGE_SIZE_MULTIPLE);
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
