import { ATTACHMENT_KIND } from "../shared/attachments";
import { storage } from "../shared/storage";
import type { UploadedAttachment } from "../shared/types";
import { resolveImageModel } from "./model-resolver";

const DEFAULT_IMAGE_SIZE = "1024x1024";

export async function generateImage(
  attachments: UploadedAttachment[],
  input: Record<string, unknown>,
) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return { error: "Missing image prompt" };
  const preferences = await storage.preferences.get();
  const model = await resolveImageModel(stringInput(input.modelId));
  const size =
    stringInput(input.size) ||
    preferences.imageGenerationSize ||
    DEFAULT_IMAGE_SIZE;
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
  const result = imageReferences.length
    ? await editImage(model, finalPrompt, imageReferences[0], input, size)
    : await createImage(model, finalPrompt, input, size);
  return {
    ...result,
    prompt: finalPrompt,
    model: model.modelName,
    referenceAttachmentIds: references.map((attachment) => attachment.id),
  };
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
  if (!response.ok) return { error: await response.text() };
  const data = await response.json();
  const first = data.data?.[0] || data.images?.[0] || data.image || data;
  const b64 =
    typeof first === "string"
      ? first
      : first.b64_json || first.base64 || first.image_base64;
  const url = typeof first === "string" ? "" : first.url || first.image_url;
  if (!b64 && !url)
    return { error: "Image generation response did not include an image" };
  return {
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
