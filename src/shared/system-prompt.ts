import type { Agent, AgentCapabilities, AgentWorkspace } from "./types";
import { isMcpServerTested, type McpServerConfig } from "./mcp";
import {
  renderWorkspaceSystemContext,
  workspaceSoulInstructions,
} from "./workspace";

export function createSystemPrompt(options: {
  capabilities: AgentCapabilities;
  imageGenerationEnabled?: boolean;
  agent?: Agent;
  workspace?: AgentWorkspace;
  browserTimeZone?: string;
  mcpServers?: McpServerConfig[];
}) {
  const currentDate = new Date().toLocaleDateString("en-CA");
  const browserTimeZone = options.browserTimeZone || currentBrowserTimeZone();
  const imageCapability = options.imageGenerationEnabled
    ? "\nFor image generation or editing requests, use generateImage."
    : "";
  const agentProfile = renderAgentProfile(options.agent, options.workspace);
  const workspaceContext = renderWorkspaceSystemContext(options.workspace);
  const mcpProfile = renderMcpProfile(options.mcpServers || []);
  if (!options.capabilities.browserAutomation) {
    return `You are OpenBrowserAgent.
${agentProfile}
${workspaceContext}
${mcpProfile}

<task>
Answer the USER's question from the content they provide.${imageCapability}
</task>

<rules>
- Current date: ${currentDate}.
- User browser time zone: ${browserTimeZone}. For exact current local date/time, use the current time tool with this time zone unless the USER asks for another; do not guess.
- Reply in the latest non-internal USER message language. If languages are mixed, use the dominant language and preserve quoted text.
- For diagrams, use fenced mermaid code blocks so the UI can show a preview while preserving copyable source.
</rules>`;
  }
  return `You are OpenBrowserAgent, a browser co-worker that completes USER tasks with browser tools.
${agentProfile}
${workspaceContext}
${mcpProfile}

<mission>
Understand the task, act human-like in the browser, and report results to the USER.${imageCapability}
</mission>

<rules>
- Current date: ${currentDate}. User browser time zone: ${browserTimeZone}. Use these for recent/latest/current information. For exact local date/time, use the current time tool with this time zone unless the USER asks for another.
- Reply in the latest non-internal USER message language. If languages are mixed, use the dominant language and preserve quoted text.
- Do not invent URLs.
- Follow tool schemas exactly. Continue using tools until the goal is achieved or blocked; after each result decide the next action.
- Briefly state the next step before tool use, but never mention tool names or AI IDs to the USER.
- When browser work needs pages or tabs, inspect relevant open tabs first and reuse them when helpful. Leave the browser in a useful final state: close tabs opened for the task after they are no longer needed, keep useful result tabs, and focus the tab the USER requested if they named one.
- If tool outputs include _sources, cite sourced claims inline as [[cite:source_id]], especially factual bullets in final reports.
- For diagrams, use fenced mermaid code blocks so the UI can show a preview while preserving copyable source.
</rules>`;
}

function renderMcpProfile(servers: McpServerConfig[]) {
  const enabledServers = servers.filter(
    (server) => server.enabled && isMcpServerTested(server),
  );
  if (!enabledServers.length) return "";
  const tools = enabledServers.flatMap((server) =>
    (server.tools || [])
      .filter((tool) => tool.enabled)
      .map((tool) => `- ${tool.name}`),
  );
  if (!tools.length) return "";
  return `
<mcp_tools>
${tools.join("\n")}
</mcp_tools>`;
}

function currentBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function renderAgentProfile(
  agent: Agent | undefined,
  workspace?: AgentWorkspace,
) {
  const instructions = workspaceSoulInstructions(workspace);
  if (!agent?.description && !instructions) return "";
  return `
<agent_profile>
${agent?.name ? `Name: ${agent.name}\n` : ""}${agent?.description ? `Description: ${agent.description}\n` : ""}${instructions ? `Instructions from SOUL.md: ${instructions}` : ""}
</agent_profile>`;
}
