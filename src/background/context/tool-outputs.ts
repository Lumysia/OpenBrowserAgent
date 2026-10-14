import { estimateTextTokens } from "@earendil-works/pi-ai/utils/estimate";
import type { ArtifactStore } from "../../shared/artifacts";
import { CONTEXT_POLICY, tokenChars } from "./policy";

const LABEL_KEYS = [
  "action",
  "tabId",
  "ref",
  "url",
  "query",
  "source",
  "path",
  "name",
];

type Output = { label: string; text: string; handle?: string };

type ToolCallOutput = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  text: string;
  // Read-only calls: an identical repeat with identical output is
  // answered with a reference to the earlier output.
  repeatable: boolean;
  // The tool bounded its output itself: it is not capped again.
  bounded?: boolean;
};

// Full text of every tool output of a run, keyed by tool call id. Outputs
// are stored as artifacts on demand (capped, masked, or repeated), so the
// model can always get back what it no longer sees.
export function createToolOutputs(chatId: string, store: ArtifactStore) {
  const outputs = new Map<string, Output>();
  const repeats = new Map<string, { text: string; toolCallId: string }>();

  // The same text is stored once per run and keeps its handle, so a
  // repeated long snapshot of an unchanged page reads the same.
  const stored = new Map<string, Promise<string>>();
  function storeText(label: string, text: string) {
    let handle = stored.get(text);
    if (!handle) {
      const name = `art-${crypto.randomUUID().slice(0, 8)}`;
      handle = store
        .put({ chatId, handle: name, label, text, createdAt: Date.now() })
        .then(() => name);
      stored.set(text, handle);
      handle.catch(() => stored.delete(text));
    }
    return handle;
  }

  async function persist(toolCallId: string) {
    const output = outputs.get(toolCallId);
    if (!output) return undefined;
    output.handle ||= await storeText(output.label, output.text);
    return output.handle;
  }

  return {
    persist,
    store: storeText,
    has: (toolCallId: string) => outputs.has(toolCallId),
    label: (toolCallId: string) => outputs.get(toolCallId)?.label,
    // What the model receives for a finished call, and the artifact that
    // keeps the full output when that text is too long to replay in later
    // turns.
    async accept(call: ToolCallOutput) {
      const text = await shown(call);
      const artifact =
        text.length > tokenChars(CONTEXT_POLICY.historyToolOutputTokens)
          ? await persist(call.toolCallId)
          : undefined;
      return { text, ...(artifact ? { artifact } : {}) };
    },
  };

  async function shown({
    toolCallId,
    toolName,
    input,
    text,
    repeatable,
    bounded,
  }: ToolCallOutput) {
    outputs.set(toolCallId, {
      label: outputLabel(toolName, input, text),
      text,
    });
    if (repeatable) {
      const key = `${toolName}:${stableJson(input)}`;
      const previous = repeats.get(key);
      repeats.set(key, { text, toolCallId });
      if (previous?.text === text) {
        const handle = await persist(previous.toolCallId);
        return `Unchanged since ${handle}: this call returned exactly the same output as the earlier identical call, so the page or data has not changed. Use read with source "${handle}" to see it again.`;
      }
    }
    if (
      bounded ||
      estimateTextTokens(text) <= CONTEXT_POLICY.toolOutputCapTokens
    )
      return text;
    const handle = await persist(toolCallId);
    // Cut at a line end so no line (and no ref) is shown half.
    const cut = text.slice(0, tokenChars(CONTEXT_POLICY.toolOutputCapTokens));
    const preview = cut.slice(
      0,
      Math.max(cut.lastIndexOf("\n"), cut.length / 2),
    );
    return `${preview}\n[Output truncated: showed ${preview.length} of ${text.length} characters. The full output is stored as "${handle}": continue with read source="${handle}" offset=${preview.length}, or make a narrower request (find, a ref, or a smaller range).]`;
  }
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

// Page tools start with "Tab 12: Title | URL"; JSON results may carry a
// title and URL.
function outputSource(text: string) {
  const header = text.match(/^Tab \d+: .*$/m)?.[0];
  if (header) return [short(header)];
  try {
    const value = JSON.parse(text);
    return ["title", "url"].flatMap((key) =>
      typeof value?.[key] === "string" && value[key]
        ? [`${key}=${short(value[key])}`]
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
