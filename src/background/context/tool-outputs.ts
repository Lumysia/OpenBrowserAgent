import { estimateTextTokens } from "@earendil-works/pi-ai/utils/estimate";
import type { ArtifactStore } from "../../shared/artifacts";
import { BROWSER_TOOL_NAME } from "../../shared/browser-tools";
import { CONTEXT_POLICY, isRepeatGuarded } from "./policy";

const CHARS_PER_TOKEN = 3.5;
const LABEL_KEYS = [
  "operation",
  "tabId",
  "url",
  "query",
  "selector",
  "handle",
  "attachmentId",
  "path",
  "name",
];

type Output = { label: string; text: string; handle?: string };

// Full text of every tool output of a run, keyed by tool call id. Outputs
// are stored as artifacts on demand (capped, masked, or repeated), so the
// model can always get back what it no longer sees.
export function createToolOutputs(chatId: string, store: ArtifactStore) {
  const outputs = new Map<string, Output>();
  const repeats = new Map<string, { text: string; toolCallId: string }>();

  async function persist(toolCallId: string) {
    const output = outputs.get(toolCallId);
    if (!output) return undefined;
    if (output.handle) return output.handle;
    const handle = `art-${crypto.randomUUID().slice(0, 8)}`;
    await store.put({
      chatId,
      handle,
      label: output.label,
      text: output.text,
      createdAt: Date.now(),
    });
    output.handle = handle;
    return handle;
  }

  return {
    persist,
    label: (toolCallId: string) => outputs.get(toolCallId)?.label,
    // What the model receives for a finished call.
    async accept({
      toolCallId,
      toolName,
      input,
      text,
    }: {
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
      text: string;
    }) {
      outputs.set(toolCallId, {
        label: outputLabel(toolName, input, text),
        text,
      });
      if (isRepeatGuarded(toolName, input)) {
        const key = `${toolName}:${stableJson(input)}`;
        const previous = repeats.get(key);
        repeats.set(key, { text, toolCallId });
        if (previous?.text === text) {
          const handle = await persist(previous.toolCallId);
          return `Unchanged since ${handle}: this call returned exactly the same output as the earlier identical call, so the page or data has not changed. Use read with handle "${handle}" to see it again.`;
        }
      }
      // `read` output is already bounded to one slice of a stored output.
      if (
        toolName === BROWSER_TOOL_NAME.read ||
        estimateTextTokens(text) <= CONTEXT_POLICY.toolOutputCapTokens
      )
        return text;
      const handle = await persist(toolCallId);
      const preview = text.slice(
        0,
        capChars(CONTEXT_POLICY.toolOutputCapTokens),
      );
      return `${preview}\n[Output truncated: showed ${preview.length} of ${text.length} characters. The full output is stored as "${handle}". Continue with read handle="${handle}" offset=${preview.length}, or make a narrower request.]`;
    },
  };
}

export async function readArtifact(
  store: ArtifactStore,
  chatId: string,
  input: Record<string, unknown>,
) {
  const handle = String(input.handle || "").trim();
  const artifact = handle ? await store.get(chatId, handle) : undefined;
  if (!artifact)
    return {
      error: `No stored output "${handle}" in this chat. Use a handle from a truncated, masked or unchanged tool result.`,
    };
  const total = artifact.text.length;
  const offset = Math.min(
    total,
    Math.max(0, Math.trunc(Number(input.offset) || 0)),
  );
  const maxChars = capChars(CONTEXT_POLICY.readMaxTokens);
  const limit = Math.min(
    maxChars,
    Math.max(1, Math.trunc(Number(input.limit) || maxChars)),
  );
  const end = Math.min(total, offset + limit);
  const position =
    end < total ? `continue with offset=${end}` : "end of output";
  return `[${handle}: ${artifact.label} | characters ${offset}-${end} of ${total}; ${position}]\n${artifact.text.slice(offset, end)}`;
}

function capChars(tokens: number) {
  return Math.floor(tokens * CHARS_PER_TOKEN);
}

// Tool name plus the arguments and output fields that identify the source.
function outputLabel(
  toolName: string,
  input: Record<string, unknown>,
  text: string,
) {
  const args = LABEL_KEYS.flatMap((key) =>
    input[key] === undefined || input[key] === ""
      ? []
      : [`${key}=${short(input[key])}`],
  );
  const source = outputSource(text);
  return [toolName, ...args, ...source].join(" ").slice(0, 300);
}

function outputSource(text: string) {
  try {
    const value = JSON.parse(text);
    const page = Array.isArray(value?.pages) ? value.pages[0] : value;
    return ["title", "url"].flatMap((key) =>
      typeof page?.[key] === "string" && page[key]
        ? [`${key}=${short(page[key])}`]
        : [],
    );
  } catch {
    return [];
  }
}

function short(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}
