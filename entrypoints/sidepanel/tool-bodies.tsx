import { CornerDownRight } from "lucide-react";
import type { ComponentType } from "react";
import { TOOL_NAME } from "../../src/shared/tool-names";
import type { ChatPart, QuestionToolAnswer } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { UI_STATE, stateWhen } from "../../src/ui/ui-state";
import { CapturedTabImage, GeneratedImage } from "./tool-media";
import { isQuestionPending, QuestionToolForm } from "./tool-question-form";

export type ToolBodyProps = {
  part: ChatPart;
  loading: boolean;
  // The run waits on this part (see ToolCardKind.waiting).
  waiting: boolean;
  // A line about the work in progress (sub-agents).
  progress?: string;
  onSelectChat?: (chatId: string) => void;
  chatExists: (chatId: string) => boolean;
  onAnswerQuestion?: (
    toolCallId: string,
    answers: QuestionToolAnswer[],
  ) => void;
};

// What a tool's card shows besides its title, description and references.
type ToolCardKind = {
  Body: ComponentType<ToolBodyProps>;
  // Where the body goes: above the description (default) or below it.
  below?: boolean;
  // The body says what the description would, so the description is left out.
  replacesDescription?: boolean;
  // The run waits on the part while this holds (a question for the user);
  // the card shows as working.
  waiting?: (part: ChatPart) => boolean;
};

const output = (part: ChatPart) =>
  (part.output || {}) as Record<string, unknown>;

export const TOOL_CARD_KINDS: Partial<Record<string, ToolCardKind>> = {
  [TOOL_NAME.generateImage]: {
    Body: ({ part, loading }) => (
      <GeneratedImage output={output(part)} loading={loading} />
    ),
  },
  [TOOL_NAME.screenshot]: {
    Body: ({ part }) => <CapturedTabImage output={output(part)} />,
  },
  [TOOL_NAME.ask]: {
    Body: ({ part, waiting, onAnswerQuestion }) => (
      <QuestionToolForm
        part={part}
        active={waiting}
        onSubmit={(answers) => onAnswerQuestion?.(part.id, answers)}
      />
    ),
    replacesDescription: true,
    waiting: isQuestionPending,
  },
  [TOOL_NAME.subAgent]: { Body: SubAgentBody, below: true },
};

function SubAgentBody({
  part,
  progress,
  chatExists,
  onSelectChat,
}: ToolBodyProps) {
  const t = useMessages();
  const chatId = String(output(part).childChatId || "").trim();
  const available = !!chatId && chatExists(chatId);
  return (
    <>
      <div
        className="tool-detail-slot"
        data-state={stateWhen(progress, UI_STATE.visible)}
        aria-hidden={!progress}
      >
        <div
          className="tool-description tool-detail-slot-content ui-selectable"
          key={progress}
        >
          {progress}
        </div>
      </div>
      {chatId && (
        <Button
          className="tool-subagent-link"
          variant="secondary"
          size="sm"
          disabled={!available}
          onClick={() => {
            if (available) onSelectChat?.(chatId);
          }}
        >
          <CornerDownRight size={14} />
          <span>{t.sidepanel.openSubAgentChat}</span>
        </Button>
      )}
    </>
  );
}
