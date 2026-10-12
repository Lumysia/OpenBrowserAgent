import { TOOL_NAME } from "../../shared/tool-names";
import { generateImage } from "../image-generation";
import { fail, schema, stringArg, type ToolDefinition } from "./types";

export const generateImageTool: ToolDefinition = {
  name: TOOL_NAME.generateImage,
  group: "images",
  onDemand: true,
  available: (run) => !!run.preferences.imageGenerationEnabled,
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
        description: "Like 1024x1024; adjusted to what the model supports.",
      },
      quality: { type: "string" },
      count: { type: "number" },
    },
    ["prompt"],
  ),
  async execute(input, { run, toolCallId, messageId, signal }) {
    if (!stringArg(input.prompt)) return fail("prompt is required.");
    const result = (await generateImage(
      run.attachments,
      input,
      { chatId: run.chatId, messageId, toolCallId },
      signal,
    )) as Record<string, unknown>;
    if (typeof result.error === "string")
      return fail(`Image generation failed: ${result.error}`, result);
    return {
      text: `Image generated with ${result.model} (${result.size}) and shown to the user.`,
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
