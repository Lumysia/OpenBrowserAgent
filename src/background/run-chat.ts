import { hasToolGroup, resolveAgent } from "../shared/agents";
import { mayActHere, type AgentActApprovals } from "../shared/tasks/approval";
import { clampMaxToolSteps } from "../shared/config";
import { getMessages } from "../shared/i18n";
import { respondWith } from "../shared/runtime-messages";
import { DESCRIBE_RUN } from "../shared/run-description";
import {
  isLocalExecutionBridgeTested,
  normalizeLocalExecutionBridges,
} from "../shared/local-execution-bridges";
import {
  availableSkills,
  listedSkills,
  resolveSkillCatalog,
} from "../shared/skill-catalog";
import { storage } from "../shared/storage";
import type { Agent, ChatMessage, UploadedAttachment } from "../shared/types";
import { workspaceForAgent } from "../shared/workspace-storage";
import { resolveHelperModel, resolveModel } from "./model-resolver";
import { runPiAgent, type RunSetup } from "./pi-runtime";
import {
  createRunTab,
  handedRunTab,
  startRunTab,
  whileWorking,
  withWorkingTab,
  workingTabNote,
  type RunTab,
} from "./run-tab";
import type { StreamSession } from "./stream-sessions";
import { createSystemPrompt } from "./system-prompt";
import { createToolSet } from "./tools/registry";
import { skillCheckOf } from "../shared/teach/check";
import { refuseRecordingTab } from "./teach/guard";
import type {
  SkillCheckRun,
  ToolDefinition,
  UnattendedRun,
} from "./tools/types";

// A run nobody watches. `readOnly`: already limited to reading (a read-only
// run's sub-agent); otherwise the agent's own permission decides.
export type UnattendedRequest = Omit<UnattendedRun, "readOnly"> & {
  readOnly?: boolean;
};

type RunRequest = {
  agentId?: string;
  modelId?: string;
  attachments?: UploadedAttachment[];
  // 0 for chats, 1 for sub-agents (which cannot start sub-agents).
  depth?: number;
  parentChatId?: string;
  // The tab a parent run hands to its sub-agent.
  tabId?: number;
  unattended?: UnattendedRequest;
  skillCheck?: SkillCheckRun;
};

// An agent acts on its own only where the user allowed it (approval.ts):
// one whose permission came by sync runs read-only until then.
function unattendedRun(
  request: UnattendedRequest | undefined,
  agent: Agent,
  approvals: AgentActApprovals,
): UnattendedRun | undefined {
  if (!request) return undefined;
  return {
    ...request,
    readOnly: request.readOnly === true || !mayActHere(agent, approvals),
  };
}

// What a run of an agent is set up with, resolved from storage: the side
// panel only names the agent, so chats and background sub-agents are set up
// the same way. A description (`store: false`) writes nothing.
async function runSetup(request: RunRequest, store: boolean, tab: RunTab) {
  const [
    agents,
    preferences,
    providers,
    userSkills,
    skillSettings,
    mcpServers,
    bridges,
    approvals,
  ] = await Promise.all([
    storage.agents.get(),
    storage.preferences.get(),
    storage.provider.get(),
    storage.skills.get(),
    storage.skillSettings.get(),
    storage.mcpServers.get(),
    storage.localExecutionBridges.get(),
    storage.agentActApprovals.get(),
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
  // Every agent can read the skills that are not off (the prompt, tools and
  // the user's picks point to them); only agents with the skills group get
  // the list of auto ones.
  const catalog = resolveSkillCatalog(userSkills, skillSettings);
  const skills = availableSkills(catalog);
  const listed = hasToolGroup(agent, "skills") ? listedSkills(catalog) : [];
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
    providers,
    depth,
    parentChatId: request.parentChatId,
    tab,
    // The agent as stored: a sub-agent's narrower groups are not a change.
    unattended: unattendedRun(request.unattended, resolved, approvals),
    ...(request.skillCheck ? { skillCheck: request.skillCheck } : {}),
  };
  const tested = normalizeLocalExecutionBridges(bridges).filter(
    isLocalExecutionBridgeTested,
  ).length;
  const maxToolSteps = clampMaxToolSteps(preferences.maxToolSteps);
  return {
    agent,
    setup,
    system: createSystemPrompt({
      agent,
      skills: listed,
      workspace,
      bridges: tested,
      maxToolSteps,
    }),
    maxToolSteps,
  };
}

async function prepareRun(request: RunRequest, tab: RunTab) {
  const prepared = await runSetup(request, true, tab);
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
  // Chosen before anything slow, while the user is still on the tab they
  // sent the message from.
  const { tab, start, earlier } = request.unattended
    ? await handedRunTab(session.chatId, request.tabId)
    : await startRunTab(session.chatId, request.messages.at(-1), request.tabId);
  // The agent does not work in a tab the user is recording.
  await refuseRecordingTab(start?.id);
  const skillCheck = skillCheckOf(request.messages.at(-1));
  const prepared = await prepareRun(
    skillCheck ? { ...request, skillCheck } : request,
    tab,
  );
  session.abortController.signal.throwIfAborted();
  const usesPages =
    hasToolGroup(prepared.agent, "pages") ||
    hasToolGroup(prepared.agent, "browser");
  await whileWorking(tab, () =>
    runPiAgent({
      session,
      model: prepared.model,
      helperModel: prepared.helperModel,
      system: prepared.system,
      messages: usesPages
        ? withWorkingTab(request.messages, workingTabNote(start, earlier))
        : request.messages,
      setup: prepared.setup,
      maxToolSteps: prepared.maxToolSteps,
      messageId: request.messageId,
      attachmentRetryNotice: getMessages(request.language).sidepanel
        .attachmentsUnsupportedRetry,
    }),
  );
  return prepared;
}

// The system prompt and the tools a run of this agent starts with, for
// chat export.
export async function describeRun(agentId: string | undefined) {
  const prepared = await runSetup({ agentId }, false, createRunTab(""));
  const toolSet = createToolSet(prepared.setup);
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

export function handleDescribeRunMessage(
  message: unknown,
  sendResponse: (response: unknown) => void,
) {
  const request = (message || {}) as { type?: string; agentId?: string };
  if (request.type !== DESCRIBE_RUN) return false;
  return respondWith(describeRun(request.agentId), sendResponse);
}
