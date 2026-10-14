import type { Messages } from "../../src/shared/i18n";
import type {
  SidePanelHandoff,
  SIDE_PANEL_TASK,
} from "../../src/shared/side-panel-handoff";
import type { Chat, ChatMessage } from "../../src/shared/types";

const TITLE_CHARS = 48;

type ContinueHandoff = Extract<
  SidePanelHandoff,
  { task: typeof SIDE_PANEL_TASK.continue }
>;

// "Continue in side panel": a new chat holding the action and its result,
// so the conversation goes on from there.
export function continuedChat(handoff: ContinueHandoff, t: Messages): Chat {
  const now = Date.now();
  const action = t.smartBar.actions[handoff.result.action];
  const source = handoff.pageUrl
    ? `\n\n${handoff.pageTitle ? `${handoff.pageTitle} — ` : ""}${handoff.pageUrl}`
    : "";
  const user: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: `${action}\n\n${quoteSelection(handoff.text)}${source}`,
    createdAt: now,
  };
  const assistant: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: handoff.result.text,
    parts: [
      {
        id: crypto.randomUUID(),
        type: "text",
        text: handoff.result.text,
        state: "done",
      },
    ],
    createdAt: now + 1,
  };
  const excerpt = handoff.text.replace(/\s+/g, " ").trim();
  return {
    id: crypto.randomUUID(),
    title: `${action}: ${
      excerpt.length > TITLE_CHARS
        ? `${excerpt.slice(0, TITLE_CHARS - 1)}…`
        : excerpt
    }`,
    messages: [user, assistant],
    createdAt: now,
    updatedAt: now + 1,
  };
}

// The selection as a Markdown quote.
function quoteSelection(text: string) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}
