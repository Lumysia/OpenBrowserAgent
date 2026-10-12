import { hasToolGroup, resolveAgent } from "../shared/agents";
import { clampMaxToolSteps } from "../shared/config";
import { getMessages } from "../shared/i18n";
import { normalizeLocalExecutionBridges } from "../shared/local-execution-bridges";
import { isSkillEnabled } from "../shared/skills";
import { storage } from "../shared/storage";
import type { Agent, ChatMessage, UploadedAttachment } from "../shared/types";
import { createWorkspace, ensureWorkspaceDefaults } from "../shared/workspace";
import { resolveHelperModel, resolveModel } from "./model-resolver";
import { runPiAgent, type RunSetup } from "./pi-runtime";
import type { StreamSession } from "./stream-sessions";
import { createSystemPrompt } from "./system-prompt";
import { createToolSet } from "./tools/registry";
import type { ToolDefinition } from "./tools/types";

export type RunRequest = {
  agentId?: string;
  modelId?: string;
  attachments?: UploadedAttachment[];
  // 0 for chats, 1 for sub-agents (which cannot start sub-agents).
  depth?: number;
};

// What a run of an agent is set up with, resolved from storage: the side
// panel only names the agent, so chats and background sub-agents are set up
// the same way. A description (`store: false`) writes nothing.
async function runSetup(request: RunRequest, store: boolean) {
  const [agents, preferences, allSkills, mcpServers, bridges] =
    await Promise.all([
      storage.agents.get(),
      storage.preferences.get(),
      storage.skills.get(),
      storage.mcpServers.get(),
      storage.localExecutionBridges.get(),
    ]);
  const depth = request.depth || 0;
  const resolved = resolveAgent(agents, request.agentId);
  const agent: Agent =
    depth > 0
      ? {
          ...resolved,
          toolGroups: resolved.toolGroups.filter(
            (group) => group !== "subAgents",
          ),
        }
      : resolved;
  const skills = hasToolGroup(agent, "skills")
    ? allSkills.filter(isSkillEnabled)
    : [];
  const workspace = agent.workspace
    ? await workspaceForAgent(agent, store)
    : undefined;
  const setup: RunSetup = {
    agent,
    skills,
    workspace,
    attachments: request.attachments || [],
    mcpServers: hasToolGroup(agent, "mcp") ? mcpServers : [],
    preferences,
    depth,
  };
  const tested = normalizeLocalExecutionBridges(bridges).filter(
    (bridge) => !!bridge.lastTestedAt && !bridge.lastTestError,
  ).length;
  return {
    agent,
    setup,
    system: createSystemPrompt({ agent, skills, workspace, bridges: tested }),
    maxToolSteps: clampMaxToolSteps(preferences.maxToolSteps),
  };
}

export async function prepareRun(request: RunRequest) {
  const prepared = await runSetup(request, true);
  const model = await resolveModel(prepared.agent.modelId, request.modelId);
  const helperModel = await resolveHelperModel(
    prepared.setup.preferences.helperModelId,
    model,
  );
  return { ...prepared, model, helperModel };
}

export async function runChat(
  session: StreamSession,
  request: RunRequest & {
    messages: ChatMessage[];
    messageId?: string;
    language?: string;
  },
) {
  const prepared = await prepareRun(request);
  session.abortController.signal.throwIfAborted();
  await runPiAgent({
    session,
    model: prepared.model,
    helperModel: prepared.helperModel,
    system: prepared.system,
    messages: request.messages,
    setup: prepared.setup,
    maxToolSteps: prepared.maxToolSteps,
    messageId: request.messageId,
    attachmentRetryNotice: getMessages(request.language).sidepanel
      .attachmentsUnsupportedRetry,
  });
  return prepared;
}

// The system prompt and the tools a run of this agent starts with, for
// chat export.
export async function describeRun(agentId: string | undefined) {
  const prepared = await runSetup({ agentId }, false);
  const unused = () => {
    throw new Error("Not available in a run description.");
  };
  const toolSet = createToolSet({
    ...prepared.setup,
    chatId: "",
    session: undefined as unknown as StreamSession,
    storeArtifact: unused,
    readArtifact: unused,
    askHelper: unused,
  });
  const schema = (tool: ToolDefinition) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  });
  return {
    system: prepared.system,
    tools: toolSet.declared().map(schema),
    onDemandTools: toolSet.onDemand.map(schema),
  };
}

async function workspaceForAgent(agent: Agent, store: boolean) {
  if (!store) {
    const existing = (await storage.agentWorkspaces.get()).find(
      (workspace) => workspace.agentId === agent.id,
    );
    return ensureWorkspaceDefaults(
      existing || createWorkspace(agent.id),
      agent,
    );
  }
  const workspaces = await storage.agentWorkspaces.update((current) => {
    const existing = current.find(
      (workspace) => workspace.agentId === agent.id,
    );
    const workspace = ensureWorkspaceDefaults(
      existing || createWorkspace(agent.id),
      agent,
    );
    return !existing || existing.files.length !== workspace.files.length
      ? current.filter((item) => item.agentId !== agent.id).concat(workspace)
      : current;
  });
  return workspaces.find((workspace) => workspace.agentId === agent.id)!;
}
