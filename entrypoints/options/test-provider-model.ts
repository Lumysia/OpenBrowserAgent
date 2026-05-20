import { MODEL_TEMPERATURE } from "../../src/shared/config";
import {
  providerDefaultBaseUrls,
  type ProviderConfig,
} from "../../src/shared/types";
import {
  ollamaChatCompletionsUrl,
  openAIChatCompletionsUrl,
} from "../../src/shared/provider-urls";

export async function testProviderModel(
  providerConfig: ProviderConfig,
  modelName: string,
) {
  const provider = providerConfig.type || "openai";
  const system = "You are checking whether this model can respond.";
  const prompt = "Reply with exactly: OK";

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(providerConfig.apiKey || "")}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    return;
  }

  const baseUrl = (
    providerConfig.baseUrl ||
    providerDefaultBaseUrls[provider] ||
    ""
  ).replace(/\/$/, "");
  const chatUrl =
    provider === "ollama"
      ? ollamaChatCompletionsUrl(baseUrl)
      : openAIChatCompletionsUrl(baseUrl);
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(providerConfig.apiKey
        ? { Authorization: `Bearer ${providerConfig.apiKey}` }
        : {}),
    },
    body: JSON.stringify({
      model: modelName,
      temperature: MODEL_TEMPERATURE,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(await response.text());
}
