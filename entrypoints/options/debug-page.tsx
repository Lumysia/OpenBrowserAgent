import { useState, type ReactNode } from "react";
import { AlertTriangle, Bug, Wrench, Trash2 } from "lucide-react";
import { browserTools } from "../../src/background/tool-schema";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { areCdpToolsAvailable } from "../../src/shared/runtime-capabilities";
import { isSkillEnabled } from "../../src/shared/skills";
import { resolveAgent } from "../../src/shared/agents";
import {
  clearAppStorage,
  type AppStorageClearScope,
  type AppStorageClearTarget,
} from "../../src/shared/storage-debug";
import { storage } from "../../src/shared/storage";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import type { AgentCapabilities } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function DebugPage() {
  const [language] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const [debugLoggingEnabled, setDebugLoggingEnabled] = useStoredState(
    storage.debugLoggingEnabled,
  );
  const [agents] = useStoredState(storage.agents);
  const [skills] = useStoredState(storage.skills);
  const [confirmText, setConfirmText] = useState("");
  const [scope, setScope] = useState<AppStorageClearScope>("all");
  const [targets, setTargets] = useState<AppStorageClearTarget[]>(["all"]);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const t = getMessages(language);
  const activeAgent = resolveAgent(agents, preferences?.selectedAgentId);
  const visibleBrowserTools = browserTools.filter(
    (tool) =>
      tool.function.name !== BROWSER_TOOL_NAME.loadTools ||
      areCdpToolsAvailable(),
  );
  const toolRows = visibleBrowserTools.map((tool) =>
    toolStatus({
      name: tool.function.name,
      preferences,
      activeAgent,
      enabledSkillCount: (skills || []).filter(isSkillEnabled).length,
      t,
    }),
  );
  const canClear =
    confirmText === t.options.debugResetConfirmPhrase && targets.length > 0;

  function updateTargets(value: string[]) {
    const next = value as AppStorageClearTarget[];
    if (next.includes("all") && !targets.includes("all")) {
      setTargets(["all"]);
      return;
    }
    setTargets(next.filter((target) => target !== "all"));
  }

  async function clearData() {
    if (!canClear || clearing) return;
    setClearing(true);
    setCleared(false);
    try {
      await clearAppStorage({ scope, targets });
      setConfirmText("");
      setCleared(true);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 className="settings-page-title">
          <Bug size={24} /> {t.options.debug}
        </h1>
        <p className="muted">{t.options.debugDescription}</p>
      </div>
      <DebugSwitchCard
        icon={<Bug size={18} />}
        title={t.options.debugLoggingTitle}
        description={t.options.debugLoggingDescription}
        checked={debugLoggingEnabled === true}
        onChange={(checked) => setDebugLoggingEnabled(checked)}
      />
      <Accordion type="single" collapsible>
        <AccordionItem value="tools">
          <AccordionTrigger className="debug-tools-trigger">
            <span className="debug-section-heading">
              <span className="debug-section-title">
                <Wrench size={18} />
                <span>{t.options.debugToolsTitle}</span>
              </span>
              <small>
                {t.options.debugToolsDescription.replace(
                  "{count}",
                  String(visibleBrowserTools.length),
                )}
              </small>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Accordion type="multiple" className="debug-tool-list">
              {visibleBrowserTools.map((tool, index) => {
                const status = toolRows[index];
                const required = tool.function.parameters.required || [];
                return (
                  <AccordionItem
                    className="debug-tool-item"
                    key={tool.function.name}
                    value={tool.function.name}
                  >
                    <AccordionTrigger className="debug-tool-trigger">
                      <span>{tool.function.name}</span>
                      <Badge
                        className={status.enabled ? "" : "debug-tool-disabled"}
                      >
                        {status.enabled
                          ? t.options.debugToolAvailable
                          : t.options.debugToolUnavailable}
                      </Badge>
                    </AccordionTrigger>
                    <AccordionContent className="debug-tool-details">
                      <p>{tool.function.description}</p>
                      {!!required.length && (
                        <small>
                          {t.options.debugToolRequired}: {required.join(", ")}
                        </small>
                      )}
                      <small className="debug-tool-status">
                        {status.reason}
                      </small>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Card>
        <CardHeader>
          <CardTitle className="settings-section-title danger-title">
            <AlertTriangle size={18} />
            <span>{t.options.debugResetTitle}</span>
          </CardTitle>
          <CardDescription>{t.options.debugResetDescription}</CardDescription>
        </CardHeader>
        <CardContent className="stack">
          <Label>
            {t.options.debugResetScope}
            <ToggleGroup
              type="single"
              value={scope}
              onValueChange={(value) =>
                value && setScope(value as AppStorageClearScope)
              }
            >
              <ToggleGroupItem value="all">
                {t.options.debugResetScopeAll}
              </ToggleGroupItem>
              <ToggleGroupItem value="local">
                {t.options.debugResetScopeLocal}
              </ToggleGroupItem>
              <ToggleGroupItem value="sync">
                {t.options.debugResetScopeSync}
              </ToggleGroupItem>
            </ToggleGroup>
          </Label>
          <Label>
            {t.options.debugResetTargets}
            <ToggleGroup
              type="multiple"
              value={targets}
              onValueChange={updateTargets}
            >
              <ToggleGroupItem value="all">
                {t.options.debugResetTargetAll}
              </ToggleGroupItem>
              <ToggleGroupItem value="settings">
                {t.options.debugResetTargetSettings}
              </ToggleGroupItem>
              <ToggleGroupItem value="providers">
                {t.options.debugResetTargetProviders}
              </ToggleGroupItem>
              <ToggleGroupItem value="agents">
                {t.options.debugResetTargetAgents}
              </ToggleGroupItem>
              <ToggleGroupItem value="skills">
                {t.options.debugResetTargetSkills}
              </ToggleGroupItem>
              <ToggleGroupItem value="mcpServers">
                {t.options.debugResetTargetMcpServers}
              </ToggleGroupItem>
              <ToggleGroupItem value="localExecutionBridges">
                {t.options.debugResetTargetLocalExecutionBridges}
              </ToggleGroupItem>
              <ToggleGroupItem value="chats">
                {t.options.debugResetTargetChats}
              </ToggleGroupItem>
            </ToggleGroup>
          </Label>
          <Label>
            {t.options.debugResetConfirmLabel.replace(
              "{phrase}",
              t.options.debugResetConfirmPhrase,
            )}
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={t.options.debugResetConfirmPhrase}
            />
          </Label>
          <Button
            variant="destructiveOutline"
            disabled={!canClear || clearing}
            onClick={clearData}
          >
            <Trash2 size={16} />
            {clearing ? t.options.debugResetting : t.options.debugResetButton}
          </Button>
          {cleared && (
            <CardDescription>{t.options.debugResetSuccess}</CardDescription>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DebugSwitchCard({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Card>
      <CardContent>
        <div className="setting-switch-row">
          <div>
            <CardTitle className="settings-section-title">
              {icon} {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Switch checked={checked} onCheckedChange={onChange} />
        </div>
      </CardContent>
    </Card>
  );
}

function toolStatus({
  name,
  preferences,
  activeAgent,
  enabledSkillCount,
  t,
}: {
  name: string;
  preferences: Awaited<ReturnType<typeof storage.preferences.get>> | undefined;
  activeAgent: ReturnType<typeof resolveAgent>;
  enabledSkillCount: number;
  t: ReturnType<typeof getMessages>;
}) {
  if ((preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS) <= 0)
    return { enabled: false, reason: t.options.debugToolStepsDisabled };
  if (!activeAgent.capabilities.browserTools)
    return capabilityStatus(activeAgent.capabilities, ["browserTools"], t);
  if (name === BROWSER_TOOL_NAME.generateImage) {
    if (!activeAgent.capabilities.imageGeneration)
      return capabilityStatus(activeAgent.capabilities, ["imageGeneration"], t);
    return preferences?.imageGenerationEnabled
      ? capabilityStatus(activeAgent.capabilities, ["imageGeneration"], t)
      : { enabled: false, reason: t.options.debugToolImageGenerationDisabled };
  }
  if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
    return { enabled: false, reason: t.options.debugToolAttachmentsRequired };
  if (name === BROWSER_TOOL_NAME.manageSkills)
    return enabledSkillCount
      ? capabilityStatus(
          activeAgent.capabilities,
          skillToolCapabilities(name),
          t,
        )
      : { enabled: false, reason: t.options.debugToolSkillsDisabled };
  return capabilityStatus(activeAgent.capabilities, toolCapabilities(name), t);
}

function capabilityStatus(
  capabilities: AgentCapabilities,
  required: Array<keyof AgentCapabilities>,
  t: ReturnType<typeof getMessages>,
) {
  const label = required
    .map((key) => t.options.agentCapabilityLabels[key])
    .join(" + ");
  const enabled = required.every((key) => capabilities[key]);
  return {
    enabled,
    reason: (enabled
      ? t.options.debugToolCapabilityEnabled
      : t.options.debugToolCapabilityDisabled
    ).replace("{capability}", label),
  };
}

function skillToolCapabilities(_name: string): Array<keyof AgentCapabilities> {
  return ["skillTools"];
}

function toolCapabilities(name: string): Array<keyof AgentCapabilities> {
  if (name === BROWSER_TOOL_NAME.loadTools) return ["deferredBrowserTools"];
  if (name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript)
    return ["cdpTools", "javascriptExecution"];
  if (name.startsWith("cdp")) return ["cdpTools"];
  if (name === BROWSER_TOOL_NAME.readFileFromUrl) return ["fileUrlRead"];
  if (
    name === BROWSER_TOOL_NAME.startSubAgent ||
    name === BROWSER_TOOL_NAME.getSubAgentStatus
  )
    return ["subAgents"];
  if (
    name === BROWSER_TOOL_NAME.manageLocalExecutionBridges ||
    name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
    name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
    name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge
  )
    return ["localExecutionBridges"];
  if (name === BROWSER_TOOL_NAME.workspaceFiles) return ["workspaceRead"];
  if (name === BROWSER_TOOL_NAME.manageMemory) return ["memoryRead"];
  if (name === BROWSER_TOOL_NAME.manageChatHistory) return ["chatHistoryRead"];
  if (name === BROWSER_TOOL_NAME.manageMcpServers) return ["mcpManagement"];
  if (name === BROWSER_TOOL_NAME.getCurrentTime) return ["currentTime"];
  if (name === BROWSER_TOOL_NAME.question) return [];
  return ["browserAutomation"];
}
