import { getMessages } from "../shared/i18n";
import { RUN_STOP_REASON } from "../shared/run-stop";
import {
  AI_STREAM_PORT_NAME,
  type AiStreamRequest,
  type SendMessagesRequest,
} from "../shared/types";
import { userErrorText } from "../shared/user-errors";
import { generateTitle } from "./chat-title";
import { runChat } from "./run-chat";
import * as sessions from "./stream-sessions";

type Handlers = {
  [Type in AiStreamRequest["type"]]: (
    port: chrome.runtime.Port,
    request: Extract<AiStreamRequest, { type: Type }>,
  ) => void;
};

const handlers: Handlers = {
  abort(port) {
    const session = sessions.getPortSession(port);
    if (session) sessions.abortSession(session.chatId);
  },
  queueMessage(port, request) {
    const session = sessions.getPortSession(port);
    const content = request.content.trim();
    if (content && session)
      sessions.queueMessage(session, { id: request.id, content });
  },
  deleteQueuedMessage(port, request) {
    const session = sessions.getPortSession(port);
    if (session) sessions.deleteQueuedMessage(session, request.id);
  },
  answerQuestion(port, request) {
    const session = sessions.getPortSession(port);
    if (session)
      sessions.answerQuestion(session, request.toolCallId, request.answers);
  },
  attachStream(port, request) {
    sessions.attachStream(port, request.chatId, request.afterSequence);
  },
  sendMessages(port, request) {
    const session = sessions.createStreamSession(request.chatId);
    sessions.attachPortToSession(port, session, undefined);
    streamAssistantResponse(session, request)
      .catch((error) => {
        if (session.abortController.signal.aborted)
          return sessions.postToSession(session, {
            type: "end",
            stopReason: RUN_STOP_REASON.aborted,
          });
        sessions.postToSession(session, {
          type: "error",
          error: userErrorText(error, getMessages(request.body.language)),
        });
      })
      .finally(() => sessions.scheduleSessionCleanup(session));
  },
  generateTitle(port, request) {
    generateTitle(request).then((title) =>
      sessions.post(port, { type: "title", title }),
    );
  },
};

async function streamAssistantResponse(
  session: sessions.StreamSession,
  request: SendMessagesRequest,
) {
  await runChat(session, {
    agentId: request.body.agentId,
    modelId: request.body.modelId,
    attachments: request.body.uploadedAttachments,
    messages: request.messages,
    messageId: request.messageId,
    language: request.body.language,
    depth: request.body.subAgent ? 1 : 0,
  });
  sessions.postToSession(session, { type: "end" });
}

function handle(port: chrome.runtime.Port, request: AiStreamRequest) {
  if (!Object.hasOwn(handlers, request?.type)) return;
  const handler = handlers[request.type] as (
    port: chrome.runtime.Port,
    request: AiStreamRequest,
  ) => void;
  handler(port, request);
}

// The side panel's chat stream: one port per panel, requests dispatched by
// type.
export function connectStreamPort(port: chrome.runtime.Port) {
  if (port.name !== AI_STREAM_PORT_NAME) return;
  port.onMessage.addListener((request: AiStreamRequest) =>
    handle(port, request),
  );
  port.onDisconnect.addListener(() => sessions.detachPort(port));
}
