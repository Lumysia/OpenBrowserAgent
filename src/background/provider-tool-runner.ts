import {
  CHAT_PART_STATE,
  AI_STREAM_REQUEST_TYPE,
  toolPartType,
  type AgentCapabilities,
  type AgentWorkspace,
  type ChatSource,
  type Preferences,
  type Skill,
  type QuestionToolAnswer,
  type QuestionToolQuestion,
  type UploadedAttachment,
} from "../shared/types";
import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { post } from "./message-helpers";
import {
  attachToolSources,
  extractVisionImage,
  mergeOutputSources,
  sanitizeToolOutput,
  type VisionImage,
} from "./provider-output";
import { executeContextAwareTool, getSubAgentStatus } from "./provider-tools";
import { getLocalExecutionBridgeStatus } from "./local-agent-tools";
import { isToolError } from "./tool-utils";

export type ProviderToolRunResult = {
  output: unknown;
  visionImage?: VisionImage;
  responseSources: ChatSource[];
};

export async function runProviderTool({
  toolName,
  toolCallId,
  input,
  port,
  chatId,
  messageId,
  uploadedAttachments,
  availableSkills,
  preferences,
  capabilities,
  workspace,
  responseSources,
  loadedToolNames,
  availableTools,
}: {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  port: chrome.runtime.Port;
  chatId?: string;
  messageId?: string;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  preferences: Preferences;
  capabilities: AgentCapabilities;
  workspace?: AgentWorkspace;
  responseSources: ChatSource[];
  loadedToolNames: Set<string>;
  availableTools: Array<{ function: { name: string } }>;
}): Promise<ProviderToolRunResult> {
  post(port, {
    type: "chunk",
    chunk: {
      type: toolPartType(toolName),
      toolCallId,
      toolName,
      state: CHAT_PART_STATE.inputAvailable,
      input,
    },
  });
  const rawOutput = !isAvailableTool(toolName, availableTools)
    ? {
        success: false,
        error: `Tool "${toolName}" is not available to the active agent.`,
      }
    : toolName === BROWSER_TOOL_NAME.question
      ? await askUserQuestion({ input, port, toolCallId })
      : await executeContextAwareTool({
          toolName,
          input,
          context: { chatId, messageId, toolCallId },
          uploadedAttachments,
          availableSkills,
          capabilities,
          workspace,
        });
  loadDeferredToolNames(rawOutput, loadedToolNames);
  const finalRawOutput = shouldWaitForSubAgent(toolName, input, rawOutput)
    ? await waitForSubAgentResult({
        rawOutput,
        input,
        port,
        toolName,
        toolCallId,
      })
    : shouldWaitForLocalAgent(toolName, input, rawOutput)
      ? await waitForLocalAgentResult({
          rawOutput,
          input,
          port,
          toolName,
          toolCallId,
        })
      : rawOutput;
  const visionImage = extractVisionImage(finalRawOutput);
  const output = attachToolSources(
    toolName,
    input,
    sanitizeToolOutput(finalRawOutput),
    responseSources,
  );
  const nextSources = mergeOutputSources(responseSources, output);
  post(port, {
    type: "chunk",
    chunk: {
      type: toolPartType(toolName),
      toolCallId,
      toolName,
      state: isToolError(output)
        ? CHAT_PART_STATE.outputError
        : CHAT_PART_STATE.outputAvailable,
      input,
      output,
    },
  });
  return { output, visionImage, responseSources: nextSources };
}

async function askUserQuestion({
  input,
  port,
  toolCallId,
}: {
  input: Record<string, unknown>;
  port: chrome.runtime.Port;
  toolCallId: string;
}) {
  const questions = normalizeQuestions(input.questions);
  if (!questions.length)
    return { success: false, error: "Question tool requires 1-6 questions." };
  const answers = await waitForQuestionAnswer(port, toolCallId);
  return {
    success: true,
    answers,
    summary: formatQuestionAnswers(answers),
  };
}

function waitForQuestionAnswer(
  port: chrome.runtime.Port,
  toolCallId: string,
): Promise<QuestionToolAnswer[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        cleanup();
        reject(new Error("Timed out waiting for the user's answer."));
      },
      10 * 60 * 1000,
    );

    function cleanup() {
      clearTimeout(timeout);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
    }

    function onDisconnect() {
      cleanup();
      reject(
        new Error("Question was canceled because the chat stream closed."),
      );
    }

    function onMessage(message: unknown) {
      if (!message || typeof message !== "object") return;
      const maybe = message as {
        type?: string;
        toolCallId?: string;
        answers?: unknown;
      };
      if (
        maybe.type !== AI_STREAM_REQUEST_TYPE.answerQuestion ||
        maybe.toolCallId !== toolCallId
      )
        return;
      cleanup();
      resolve(normalizeAnswers(maybe.answers));
    }

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  });
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

async function waitForLocalAgentResult({
  rawOutput,
  input,
  port,
  toolName,
  toolCallId,
}: {
  rawOutput: unknown;
  input: Record<string, unknown>;
  port: chrome.runtime.Port;
  toolName: string;
  toolCallId: string;
}) {
  postToolOutput(port, toolName, toolCallId, input, rawOutput);
  const output = rawOutput as Record<string, unknown>;
  const taskId = String(output.taskId || "").trim();
  const timeoutMs = clampLocalAgentTimeout(input.timeoutMs);
  const startedAt = Date.now();
  let status = await getLocalExecutionBridgeStatus({ taskId });
  let lastProgressKey = progressKey(status);
  while (isPendingDelegateState(status) && Date.now() - startedAt < timeoutMs) {
    await sleep(500);
    status = await getLocalExecutionBridgeStatus({ taskId });
    const nextProgressKey = progressKey(status);
    if (nextProgressKey !== lastProgressKey) {
      lastProgressKey = nextProgressKey;
      postToolOutput(
        port,
        toolName,
        toolCallId,
        input,
        mergeToolObjects(rawOutput, status),
      );
    }
  }
  return mergeToolObjects(rawOutput, status);
}

async function waitForSubAgentResult({
  rawOutput,
  input,
  port,
  toolName,
  toolCallId,
}: {
  rawOutput: unknown;
  input: Record<string, unknown>;
  port: chrome.runtime.Port;
  toolName: string;
  toolCallId: string;
}) {
  postToolOutput(port, toolName, toolCallId, input, rawOutput);
  const output = rawOutput as Record<string, unknown>;
  const taskId = String(output.taskId || output.childChatId || "").trim();
  const timeoutMs = clampSubAgentTimeout(input.timeoutMs);
  const startedAt = Date.now();
  let status = await getSubAgentStatus({ taskId });
  let lastProgressKey = progressKey(status);
  while (isPendingSubAgentState(status) && Date.now() - startedAt < timeoutMs) {
    await sleep(500);
    status = await getSubAgentStatus({ taskId });
    const nextProgressKey = progressKey(status);
    if (nextProgressKey !== lastProgressKey) {
      lastProgressKey = nextProgressKey;
      postToolOutput(
        port,
        toolName,
        toolCallId,
        input,
        mergeToolObjects(rawOutput, status),
      );
    }
  }
  return mergeToolObjects(rawOutput, status);
}

function isPendingSubAgentState(output: unknown) {
  return isPendingDelegateState(output);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldWaitForSubAgent(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
) {
  return (
    toolName === BROWSER_TOOL_NAME.startSubAgent &&
    input.background !== true &&
    !!output &&
    typeof output === "object" &&
    !isToolError(output)
  );
}

function shouldWaitForLocalAgent(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
) {
  return (
    toolName === BROWSER_TOOL_NAME.startLocalExecutionBridge &&
    input.background !== true &&
    !!output &&
    typeof output === "object" &&
    !isToolError(output)
  );
}

function clampLocalAgentTimeout(value: unknown) {
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

function postToolOutput(
  port: chrome.runtime.Port,
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>,
  rawOutput: unknown,
) {
  const output = sanitizeToolOutput(rawOutput);
  post(port, {
    type: "chunk",
    chunk: {
      type: toolPartType(toolName),
      toolCallId,
      toolName,
      state: isToolError(output)
        ? CHAT_PART_STATE.outputError
        : CHAT_PART_STATE.outputAvailable,
      input,
      output,
    },
  });
}

function isAvailableTool(
  toolName: string,
  availableTools: Array<{ function: { name: string } }>,
) {
  return availableTools.some((tool) => tool.function.name === toolName);
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
