import type { TaskDraft } from "../../../src/shared/tasks/edit";
import { TASK_LIMITS } from "../../../src/shared/tasks/types";
import type { ChatMessage, SelectedElement } from "../../../src/shared/types";

// A task form prefilled from a message of a chat: its request, the chat's
// agent, and, when the message was sent with an element picked on a page,
// a watch of that element.
export function taskDraftFromMessage(
  message: ChatMessage,
  agentId: string | undefined,
  title: string,
): Partial<TaskDraft> {
  const elements = (message.metadata?.selectedElements ??
    []) as SelectedElement[];
  const element = elements.find((item) => item.path && item.pageUrl);
  const draft: Partial<TaskDraft> = {
    title: title.slice(0, TASK_LIMITS.titleChars),
    prompt: message.content.slice(0, TASK_LIMITS.promptChars),
    agentId,
  };
  if (element?.path && element.pageUrl)
    return {
      ...draft,
      trigger: {
        kind: "watch",
        url: element.pageUrl,
        selector: element.path,
        everyMinutes: TASK_LIMITS.defaultWatchMinutes,
      },
    };
  return draft;
}
