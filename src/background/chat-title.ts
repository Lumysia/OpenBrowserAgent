import {
  GENERATED_TITLE_MAX_CJK_CHARS,
  GENERATED_TITLE_MAX_LENGTH,
  GENERATED_TITLE_MAX_WORDS,
} from "../shared/config";
import type { GenerateTitleRequest } from "../shared/types";
import { resolveModel } from "./model-resolver";
import { requestText } from "./pi-provider";

const TITLE_SYSTEM_PROMPT =
  "Create concise chat titles. Return only the title, no quotes, no punctuation wrapper, no explanation.";

const titlePrompt = (message: string) =>
  `Summarize this chat starter into a title in the same language as the message.

Rules:
- Maximum ${GENERATED_TITLE_MAX_WORDS} English words, or maximum ${GENERATED_TITLE_MAX_CJK_CHARS} CJK characters for Chinese/Japanese/Korean.
- No trailing period.
- Return the title only.

Message:
${message}`;

// A short title for a new chat. An empty title keeps the chat's own,
// localized one.
export async function generateTitle(request: GenerateTitleRequest) {
  const fallback = compactTitle(request.message);
  try {
    const model = await resolveModel(request.modelId);
    const { text } = await requestText(model, {
      system: TITLE_SYSTEM_PROMPT,
      prompt: titlePrompt(request.message),
    });
    return compactTitle(text) || fallback;
  } catch {
    return fallback;
  }
}

// Scripts written without spaces between words, counted by characters.
const UNSPACED_SCRIPT =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

export function compactTitle(value: string) {
  const title = value
    .replace(/[\r\n]+/g, " ")
    .replace(/^[[({"'“‘`\s]+|[\])}"'”’`\s.。!！?？:：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return "";
  if (UNSPACED_SCRIPT.test(title))
    return title.replace(/\s+/g, "").slice(0, GENERATED_TITLE_MAX_CJK_CHARS);
  return title
    .split(/\s+/)
    .slice(0, GENERATED_TITLE_MAX_WORDS)
    .join(" ")
    .slice(0, GENERATED_TITLE_MAX_LENGTH);
}
