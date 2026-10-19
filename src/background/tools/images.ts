import { chooseImageModel } from "../../shared/model-choice";
import { trimmedString } from "../../shared/values";
import { TOOL_NAME } from "../../shared/tool-names";
import { generateImage } from "../image-generation";
import { fail, schema, type ToolDefinition } from "./types";

export const generateImageTool: ToolDefinition = {
  name: TOOL_NAME.generateImage,
  // A paid outside service, and the image is saved: it acts.
  effects: "act",
  group: "images",
  onDemand: true,
  // On once an image model is chosen in Settings.
  available: (run) => !!chooseImageModel(run.providers, run.preferences),
  summary: "Create or edit an image",
  description:
    "Create an image from a prompt, or edit one: pass uploaded image attachment ids as references (text attachments are added to the prompt). The image is shown to the user, not to you.",
  parameters: schema(
    {
      prompt: {
        type: "string",
        description: "Detailed description of the image.",
      },
      referenceAttachmentIds: { type: "array", items: { type: "string" } },
      size: {
        type: "string",
        description:
          "WIDTHxHEIGHT in pixels, chosen for the request: 1024x1024 square, 1536x1024 landscape, 1024x1536 portrait, wider for banners. Adjusted to what the model supports.",
      },
      quality: { type: "string" },
      count: { type: "number" },
    },
    ["prompt", "size"],
  ),
  async execute(input, { run, toolCallId, messageId, signal }) {
    if (!trimmedString(input.prompt)) return fail("prompt is required.");
    const result = (await generateImage(
      run.attachments,
      input,
      { chatId: run.chatId, messageId, toolCallId },
      signal,
    )) as Record<string, unknown>;
    if (typeof result.error === "string")
      return fail(`Image generation failed: ${result.error}`, result);
    return {
      text: `Image generated with ${result.model} (${result.size}) and shown to the user.${result.imageAttachmentId ? ` Stored as attachment:${result.imageAttachmentId}.` : ""}`,
      details: result,
      sources: [
        {
          kind: "image",
          title: String(result.model || "Generated image"),
          snippet: String(result.prompt || ""),
        },
      ],
    };
  },
};
