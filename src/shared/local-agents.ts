import type { LocalAgentConfig } from "./types";

export const LOCAL_AGENT_DEFAULT_TIMEOUT_MS = 120_000;
export const LOCAL_AGENT_MAX_TIMEOUT_MS = 30 * 60_000;

export const DEFAULT_LOCAL_AGENTS: LocalAgentConfig[] = [];

export function generateLocalAgentSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function createLocalAgentDraft(name: string): LocalAgentConfig {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    hostName: "openbrowseragent.local_execution_bridge",
    hostAddress: "",
    secret: generateLocalAgentSecret(),
    agentKey: "",
    defaultCwd: "",
    timeoutMs: LOCAL_AGENT_DEFAULT_TIMEOUT_MS,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeLocalAgents(
  value: LocalAgentConfig[] | undefined,
): LocalAgentConfig[] {
  const now = Date.now();
  return (Array.isArray(value) ? value : [])
    .filter(isLocalAgentLike)
    .map((agent) => {
      const rest = { ...(agent as LocalAgentConfig & { enabled?: boolean }) };
      delete rest.enabled;
      return {
        ...rest,
        name: agent.name.trim() || "Execution Bridge",
        description: agent.description || "",
        hostName: agent.hostName.trim(),
        hostAddress: agent.hostAddress?.trim() || "",
        secret: agent.secret?.trim() || generateLocalAgentSecret(),
        agentKey: agent.agentKey?.trim() || "",
        defaultCwd: agent.defaultCwd?.trim() || "",
        timeoutMs: clampLocalAgentTimeout(agent.timeoutMs),
        lastTestedAt: agent.lastTestedAt,
        lastTestError: agent.lastTestError || "",
        createdAt: agent.createdAt || now,
        updatedAt: agent.updatedAt || agent.createdAt || now,
      };
    });
}

export function resolveLocalAgent(
  agents: LocalAgentConfig[] | undefined,
  agentId?: string,
  agentName?: string,
) {
  const bridges = normalizeLocalAgents(agents).filter(
    (agent) => agent.hostName,
  );
  const name = agentName?.trim().toLowerCase();
  return (
    bridges.find((agent) => agent.id === agentId) ||
    (name
      ? bridges.find((agent) => agent.name.toLowerCase() === name)
      : null) ||
    bridges[0]
  );
}

export function clampLocalAgentTimeout(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return LOCAL_AGENT_DEFAULT_TIMEOUT_MS;
  return Math.min(
    LOCAL_AGENT_MAX_TIMEOUT_MS,
    Math.max(1_000, Math.trunc(number)),
  );
}

function isLocalAgentLike(value: LocalAgentConfig | undefined) {
  return (
    !!value?.id &&
    typeof value.name === "string" &&
    typeof value.hostName === "string"
  );
}
