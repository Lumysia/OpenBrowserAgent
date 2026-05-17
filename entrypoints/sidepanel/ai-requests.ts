import {
  AI_STREAM_PORT_NAME,
  AI_STREAM_REQUEST_TYPE,
} from "../../src/shared/types";
import type {
  AiStreamRequest,
  AiStreamResponse,
  ChatMessage,
  Skill,
} from "../../src/shared/types";

export function requestSkill({
  modelId,
  messages,
  onSuccess,
  onError,
}: {
  modelId?: string;
  messages: ChatMessage[];
  onSuccess: (skill: Skill) => void;
  onError: (error?: string) => void;
}) {
  const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
  const cleanup = createPortCleanup(port);
  port.onMessage.addListener((message: AiStreamResponse) => {
    if (message.type === "skill") {
      onSuccess(message.skill);
      cleanup();
    }
    if (message.type === "error") {
      onError(message.error);
      cleanup();
    }
  });
  try {
    port.postMessage({
      type: AI_STREAM_REQUEST_TYPE.generateSkill,
      modelId,
      messages,
    } satisfies AiStreamRequest);
  } catch {
    onError();
    cleanup();
  }
}

export function requestSkillSelection({
  modelId,
  message,
  skills,
}: {
  modelId?: string;
  message: string;
  skills: Skill[];
}) {
  return new Promise<string | undefined>((resolve) => {
    const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
    const cleanup = createPortCleanup(port);
    port.onMessage.addListener((response: AiStreamResponse) => {
      if (response.type === "skillSelection") {
        resolve(response.skillId);
        cleanup();
      }
      if (response.type === "error") {
        resolve(undefined);
        cleanup();
      }
    });
    try {
      port.postMessage({
        type: AI_STREAM_REQUEST_TYPE.selectSkill,
        modelId,
        message,
        skills,
      } satisfies AiStreamRequest);
    } catch {
      resolve(undefined);
      cleanup();
    }
  });
}

export function requestGeneratedTitle({
  modelId,
  message,
  onTitle,
}: {
  modelId?: string;
  message: string;
  onTitle: (title: string) => void;
}) {
  const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
  const cleanup = createPortCleanup(port);
  port.onMessage.addListener((response: AiStreamResponse) => {
    if (response.type === "title") {
      const title = response.title.trim();
      if (title) onTitle(title);
      cleanup();
    }
    if (response.type === "error") cleanup();
  });
  try {
    port.postMessage({
      type: AI_STREAM_REQUEST_TYPE.generateTitle,
      modelId,
      message,
    } satisfies AiStreamRequest);
  } catch {
    cleanup();
  }
}

function createPortCleanup(port: chrome.runtime.Port) {
  return () => {
    try {
      port.disconnect();
    } catch {
      // Best-effort cleanup for stale ports.
    }
  };
}
