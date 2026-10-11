import {
  CHAT_PART_STATE,
  toolPartType,
  type AgentCapabilities,
  type AgentWorkspace,
  type ChatSource,
  type Skill,
  type QuestionToolAnswer,
  type QuestionToolQuestion,
  type UploadedAttachment,
} from "../shared/types";
import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import {
  postToSession,
  waitForAnswer,
  type StreamSession,
} from "./stream-sessions";
import {
  attachToolSources,
  extractVisionImage,
  mergeOutputSources,
  sanitizeToolOutput,
  sanitizeToolOutputForModel,
  type VisionImage,
} from "./provider-output";
import { executeContextAwareTool, getSubAgentStatus } from "./provider-tools";
import { getLocalExecutionBridgeStatus } from "./local-execution-bridge-tools";
import { isToolError } from "./tool-utils";
import { delay } from "../shared/cancellation";

export type ProviderToolRunResult = {
  output: unknown;
  modelOutput: unknown;
  visionImage?: VisionImage;
  responseSources: ChatSource[];
};

export async function runProviderTool({
  toolName,
  toolCallId,
  input,
  session,
  messageId,
  uploadedAttachments,
  availableSkills,
  capabilities,
  workspace,
  responseSources,
  loadedToolNames,
  signal,
}: {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  session: StreamSession;
  messageId?: string;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  capabilities: AgentCapabilities;
  workspace?: AgentWorkspace;
  responseSources: ChatSource[];
  loadedToolNames: Set<string>;
  signal?: AbortSignal;
}): Promise<ProviderToolRunResult> {
  const post = (output?: unknown) =>
    postToSession(session, {
      type: "chunk",
      chunk: {
        type: toolPartType(toolName),
        toolCallId,
        toolName,
        state:
          output === undefined
            ? CHAT_PART_STATE.inputAvailable
            : isToolError(output)
              ? CHAT_PART_STATE.outputError
              : CHAT_PART_STATE.outputAvailable,
        input,
        output,
      },
    });
  post();
  const rawOutput =
    toolName === BROWSER_TOOL_NAME.question
      ? await askUserQuestion(session, input, toolCallId, signal)
      : await executeContextAwareTool({
          toolName,
          input,
          context: { chatId: session.chatId, messageId, toolCallId },
          uploadedAttachments,
          availableSkills,
          capabilities,
          workspace,
          signal,
        });
  loadDeferredToolNames(rawOutput, loadedToolNames);
  const finalRawOutput = shouldWaitForDelegate(toolName, input, rawOutput)
    ? await waitForDelegateResult(rawOutput, input, toolName, post, signal)
    : rawOutput;
  signal?.throwIfAborted();
  const visionImage = extractVisionImage(finalRawOutput);
  const output = attachToolSources(
    toolName,
    input,
    sanitizeToolOutput(finalRawOutput),
    responseSources,
  );
  const modelOutput = attachToolSources(
    toolName,
    input,
    sanitizeToolOutputForModel(finalRawOutput),
    responseSources,
  );
  const nextSources = mergeOutputSources(responseSources, output);
  post(output);
  return { output, modelOutput, visionImage, responseSources: nextSources };
}

async function askUserQuestion(
  session: StreamSession,
  input: Record<string, unknown>,
  toolCallId: string,
  signal?: AbortSignal,
) {
  const questions = normalizeQuestions(input.questions);
  if (!questions.length)
    return { success: false, error: "Question tool requires 1-6 questions." };
  const answers = await waitForAnswer(
    session,
    toolCallId,
    (raw) => {
      const answers = normalizeAnswers(raw);
      return answers.length ? answers : undefined;
    },
    signal,
  );
  return {
    success: true,
    answers,
    summary: formatQuestionAnswers(answers),
  };
}

function normalizeQuestions(value: unknown): QuestionToolQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const question = String(raw.question || "").trim();
    const options = Array.isArray(raw.options)
      ? raw.options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const optionRecord = option as Record<string, unknown>;
          const label = String(optionRecord.label || "").trim();
          if (!label) return [];
          return [
            {
              label,
              description: String(optionRecord.description || "").trim(),
            },
          ];
        })
      : [];
    if (!question || !options.length) return [];
    return [
      {
        question,
        options,
        multiple: raw.multiple === true,
        custom: raw.custom !== false,
      },
    ];
  });
}

function normalizeAnswers(value: unknown): QuestionToolAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const question = String(raw.question || "").trim();
    const answers = Array.isArray(raw.answers)
      ? raw.answers.map((answer) => String(answer).trim()).filter(Boolean)
      : [];
    const customAnswer = String(raw.customAnswer || "").trim();
    return [{ question, answers, customAnswer }];
  });
}

function formatQuestionAnswers(answers: QuestionToolAnswer[]) {
  return answers
    .map((answer) => {
      const selected = [...answer.answers, answer.customAnswer]
        .filter(Boolean)
        .join(", ");
      return `- ${answer.question}: ${selected || "No answer"}`;
    })
    .join("\n");
}

async function waitForDelegateResult(
  rawOutput: unknown,
  input: Record<string, unknown>,
  toolName: string,
  post: (output: unknown) => void,
  signal?: AbortSignal,
) {
  post(sanitizeToolOutput(rawOutput));
  const output = rawOutput as Record<string, unknown>;
  const taskId = String(output.taskId || output.childChatId || "").trim();
  const local = toolName === BROWSER_TOOL_NAME.startLocalExecutionBridge;
  const getStatus = local ? getLocalExecutionBridgeStatus : getSubAgentStatus;
  const timeoutMs = local
    ? clampLocalExecutionBridgeTimeout(input.timeoutMs)
    : clampSubAgentTimeout(input.timeoutMs);
  const startedAt = Date.now();
  let status = await getStatus({ taskId }, signal);
  let lastProgressKey = progressKey(status);
  while (isPendingDelegateState(status) && Date.now() - startedAt < timeoutMs) {
    await delay(500, signal);
    status = await getStatus({ taskId }, signal);
    signal?.throwIfAborted();
    const nextProgressKey = progressKey(status);
    if (nextProgressKey !== lastProgressKey) {
      lastProgressKey = nextProgressKey;
      post(sanitizeToolOutput(mergeToolObjects(rawOutput, status)));
    }
  }
  return mergeToolObjects(rawOutput, status);
}

function isPendingDelegateState(output: unknown) {
  return (
    !!output &&
    typeof output === "object" &&
    ["running", "missing"].includes(
      String((output as Record<string, unknown>).state),
    )
  );
}

function progressKey(output: unknown) {
  if (!output || typeof output !== "object") return "";
  const progress = (output as Record<string, unknown>).progress;
  return JSON.stringify(Array.isArray(progress) ? progress.at(-1) : null);
}

function clampSubAgentTimeout(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60_000;
  return Math.min(180_000, Math.max(0, Math.trunc(number)));
}

function shouldWaitForDelegate(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
) {
  return (
    (toolName === BROWSER_TOOL_NAME.startSubAgent ||
      toolName === BROWSER_TOOL_NAME.startLocalExecutionBridge) &&
    input.background !== true &&
    !!output &&
    typeof output === "object" &&
    !isToolError(output)
  );
}

function clampLocalExecutionBridgeTimeout(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60_000;
  return Math.min(30 * 60_000, Math.max(0, Math.trunc(number)));
}

function mergeToolObjects(base: unknown, next: unknown) {
  return {
    ...(base && typeof base === "object" ? base : {}),
    ...(next && typeof next === "object" ? next : {}),
  };
}

function loadDeferredToolNames(output: unknown, loadedToolNames: Set<string>) {
  const names =
    output && typeof output === "object" && "loadedToolNames" in output
      ? (output as { loadedToolNames?: unknown }).loadedToolNames
      : undefined;
  if (!Array.isArray(names)) return;
  names
    .map(String)
    .filter(Boolean)
    .forEach((name) => loadedToolNames.add(name));
}
