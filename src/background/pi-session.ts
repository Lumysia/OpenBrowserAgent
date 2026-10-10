import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import { createProviderStream } from "./pi-provider";

export type QueuedUserMessage = UserMessage & { queueId: string };

export function createSessionAgent() {
  return new Agent({
    streamFn: createProviderStream({
      provider: "openai",
      apiKey: "",
      baseUrl: "",
      modelName: "",
    }),
    steeringMode: "all",
    followUpMode: "all",
    toolExecution: "sequential",
  });
}

export function isQueuedMessage(
  message: AgentMessage,
): message is QueuedUserMessage {
  return message.role === "user" && "queueId" in message;
}

export function queueAgentMessage(
  agent: Agent,
  message: { id: string; content: string },
) {
  const queued = agent.peekQueuedMessages();
  const index = queued.findIndex(
    (item) => isQueuedMessage(item) && item.queueId === message.id,
  );
  const next: QueuedUserMessage = {
    role: "user",
    queueId: message.id,
    content: message.content,
    timestamp: Date.now(),
  };
  if (index < 0) agent.steer(next);
  else {
    queued[index] = next;
    agent.clearSteeringQueue();
    queued.forEach((item) => agent.steer(item));
  }
}

export function deleteAgentQueuedMessage(agent: Agent, id: string) {
  const remaining = agent
    .peekQueuedMessages()
    .filter((message) => !isQueuedMessage(message) || message.queueId !== id);
  agent.clearSteeringQueue();
  remaining.forEach((message) => agent.steer(message));
}
