export const COMPACTION_SYSTEM_PROMPT = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns may be kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`;

export const COMPACTION_SUMMARY_TEMPLATE = `## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]`;

export function buildCompactionPrompt(input: {
  previousSummary?: string;
  context: string[];
}) {
  const anchor = input.previousSummary
    ? [
        "Update the anchored summary below using the conversation history above.",
        "Preserve still-true details, remove stale details, and merge in the new facts.",
        " ",
        input.previousSummary,
        " ",
      ].join("\n")
    : "Create a new anchored summary from the conversation history above.";
  return [...input.context, anchor, summaryTemplatePrompt()].join("\n\n");
}

export function renderCompactionContext(
  messages: Array<Record<string, unknown>>,
  maxChars: number,
) {
  const chunks: string[] = [];
  let chars = 0;
  for (const message of messages) {
    const chunk = renderMessageForCompaction(message);
    if (!chunk) continue;
    if (chars + chunk.length > maxChars) break;
    chunks.push(chunk);
    chars += chunk.length;
  }
  return chunks;
}

function summaryTemplatePrompt() {
  return `Output exactly the Markdown structure shown inside and keep the section order unchanged. Do not include the tags in your response.
 
${COMPACTION_SUMMARY_TEMPLATE}
 

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;
}

function renderMessageForCompaction(message: Record<string, unknown>) {
  const role = typeof message.role === "string" ? message.role : "message";
  const content = compactMessageContent(message.content);
  const toolCalls = Array.isArray(message.tool_calls)
    ? `\ntool_calls: ${truncate(JSON.stringify(message.tool_calls), 2_000)}`
    : "";
  const callId =
    typeof message.tool_call_id === "string" ? message.tool_call_id : "";
  const header = callId ? `${role} tool_call_id=${callId}` : role;
  const text = `${header}:\n${content}${toolCalls}`.trim();
  return text.length > `${header}:`.length ? text : undefined;
}

function compactMessageContent(content: unknown): string {
  if (typeof content === "string") return truncate(content, 8_000);
  if (!Array.isArray(content)) return truncate(JSON.stringify(content), 2_000);
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return String(part || "");
      const record = part as Record<string, unknown>;
      const text = record.text;
      if (typeof text === "string") return truncate(text, 8_000);
      if (record.type === "image_url" || record.type === "input_image")
        return "[image omitted]";
      return truncate(JSON.stringify(record), 2_000);
    })
    .filter(Boolean)
    .join("\n");
}

function truncate(value: unknown, maxChars: number) {
  const text = typeof value === "string" ? value : String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]`;
}

export function compactedContextPlaceholder(count: number, chars: number) {
  return `<context_compacted>
## Goal
- Continue the current user task using the preserved latest user request and recent messages.

## Constraints & Preferences
- Preserve all explicit constraints from the latest visible user request and recent messages.

## Progress
### Done
- Older raw conversation turns were omitted from this request to stay within the context budget.

### In Progress
- Continue from the preserved recent messages without asking the user to repeat visible task details.

### Blocked
- (none)

## Key Decisions
- Use preserved recent context as authoritative when older raw tool output is unavailable.

## Next Steps
- Continue the active task from the preserved latest user request and recent messages.

## Critical Context
- Omitted messages: ${count}.
- Omitted chars: ${chars}.
- If exact omitted tool output is needed, re-run or re-read the relevant tool data instead of asking the user to restate the task.

## Relevant Files
- (none)
</context_compacted>`;
}
