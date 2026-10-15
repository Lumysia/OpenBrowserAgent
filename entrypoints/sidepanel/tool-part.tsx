import {
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
  type ChatPart,
  type QuestionToolAnswer,
} from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/ui/components";
import { toolDisplay, toolJsonDetail } from "./tool-part-detail";
import { toolIcon } from "./tool-icons";
import { TOOL_CARD_KINDS } from "./tool-bodies";
import { DownloadReferences } from "./download-tool-display";
import { ToolReferenceButton } from "./tool-references";
import { UI_STATE } from "../../src/ui/ui-state";
import { useMessages } from "../../src/ui/messages";

export function ToolPart({
  part,
  runEnded = false,
  onSelectChat,
  chatExists,
  onAnswerQuestion,
}: {
  part: ChatPart;
  runEnded?: boolean;
  onSelectChat?: (chatId: string) => void;
  chatExists: (chatId: string) => boolean;
  onAnswerQuestion?: (
    toolCallId: string,
    answers: QuestionToolAnswer[],
  ) => void;
}) {
  const t = useMessages();
  if (!isToolPartType(part.type)) return null;
  const name = part.toolName || toolNameFromPartType(part.type);
  const { title, failed, description, references, subAgentProgress } =
    toolDisplay(name, part, t, runEnded);
  const kind = TOOL_CARD_KINDS[name];
  const waiting = !!kind?.waiting?.(part, runEnded);
  const loading =
    waiting ||
    (!runEnded &&
      (part.state === CHAT_PART_STATE.streaming ||
        part.state === CHAT_PART_STATE.inputStreaming ||
        part.state === CHAT_PART_STATE.inputAvailable));
  const isDone =
    part.state === CHAT_PART_STATE.outputAvailable ||
    part.state === CHAT_PART_STATE.done ||
    (runEnded && part.state === CHAT_PART_STATE.inputAvailable);
  const status = loading
    ? UI_STATE.loading
    : failed
      ? UI_STATE.error
      : isDone
        ? UI_STATE.done
        : UI_STATE.idle;
  const body = kind && (
    <kind.Body
      part={part}
      loading={loading}
      waiting={waiting}
      progress={subAgentProgress}
      onSelectChat={onSelectChat}
      chatExists={chatExists}
      onAnswerQuestion={onAnswerQuestion}
    />
  );
  return (
    <div className="tool-card" data-state={status}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="tool-title tool-title-button">
            <span className="tool-icon">
              {toolIcon(name, (part.input || {}) as Record<string, unknown>)}
            </span>
            <strong className="tool-title-text">
              {loading ? <span className="shiny-text">{title}</span> : title}
            </strong>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="tool-json-popover" align="start">
          <pre className="ui-code-surface ui-selectable">
            {toolJsonDetail(name, part)}
          </pre>
        </PopoverContent>
      </Popover>
      <div className="tool-detail">
        <div className="tool-detail-content">
          {!kind?.below && body}
          {description && !kind?.replacesDescription && (
            <div className="tool-description ui-selectable">{description}</div>
          )}
          {kind?.below && body}
          <DownloadReferences output={part.output} />
          {!!references.length && (
            <div className="tool-references">
              {references.map((reference, index) => (
                <ToolReferenceButton
                  key={reference.title}
                  reference={reference}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
