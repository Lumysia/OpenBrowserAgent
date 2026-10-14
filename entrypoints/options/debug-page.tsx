import { useEffect, useState } from "react";
import { AlertTriangle, Bug, Wrench, Trash2 } from "lucide-react";
import { getMessages, type Messages } from "../../src/shared/i18n";
import { resolveAgent } from "../../src/shared/agents";
import {
  describeRun,
  type RunDescription,
} from "../../src/shared/run-description";
import {
  APP_STORAGE_CLEAR_SCOPES,
  APP_STORAGE_CLEAR_TARGETS,
  clearAppStorage,
  type AppStorageClearScope,
  type AppStorageClearTarget,
} from "../../src/shared/storage-debug";
import { storage } from "../../src/shared/storage";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Feedback,
  Label,
  SettingSwitchCard,
  ToggleGroup,
  ToggleGroupItem,
  SettingsPageHeader,
  SettingsSection,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { errorWithDetail } from "../../src/shared/user-errors";
import { useUiLanguage } from "../../src/ui/messages";

export function DebugPage() {
  const language = useUiLanguage();
  const [preferences] = useStoredState(storage.preferences);
  const [debugLoggingEnabled, setDebugLoggingEnabled] = useStoredState(
    storage.debugLoggingEnabled,
  );
  const [agents] = useStoredState(storage.agents);
  const [run, setRun] = useState<RunDescription>();
  const [confirmText, setConfirmText] = useState("");
  const [scope, setScope] = useState<AppStorageClearScope>("all");
  const [targets, setTargets] = useState<AppStorageClearTarget[]>(["all"]);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [clearError, setClearError] = useState("");
  const t = getMessages(language);
  const activeAgent = resolveAgent(agents, preferences?.selectedAgentId);
  useEffect(() => {
    describeRun(activeAgent.id)
      .then(setRun)
      .catch((error) => console.warn("Failed to describe agent tools", error));
  }, [activeAgent.id, agents]);
  const tools = [
    ...(run?.tools || []).map((tool) => ({
      ...tool.function,
      onDemand: false,
    })),
    ...(run?.onDemandTools || []).map((tool) => ({
      ...tool.function,
      onDemand: true,
    })),
  ];
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
    setClearError("");
    try {
      await clearAppStorage({ scope, targets });
      setConfirmText("");
      setCleared(true);
    } catch (error) {
      setClearError(errorWithDetail(t.options.debugResetError, error, t));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Bug />}
        title={t.options.debug}
        description={t.options.debugDescription}
      />
      <SettingSwitchCard
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
                  String(tools.length),
                )}
              </small>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Accordion type="multiple" className="debug-tool-list">
              {tools.map((tool) => {
                const required = tool.parameters.required || [];
                return (
                  <AccordionItem
                    className="debug-tool-item"
                    key={tool.name}
                    value={tool.name}
                  >
                    <AccordionTrigger className="debug-tool-trigger">
                      <span>{tool.name}</span>
                      <Badge
                        className={tool.onDemand ? "debug-tool-on-demand" : ""}
                      >
                        {tool.onDemand
                          ? t.options.debugToolOnDemand
                          : t.options.debugToolCore}
                      </Badge>
                    </AccordionTrigger>
                    <AccordionContent className="debug-tool-details ui-selectable">
                      <p>{tool.description}</p>
                      {!!required.length && (
                        <small>
                          {t.options.debugToolRequired}: {required.join(", ")}
                        </small>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <SettingsSection
        danger
        icon={<AlertTriangle />}
        title={t.options.debugResetTitle}
        description={t.options.debugResetDescription}
        contentClassName="stack"
      >
        <Label>
          {t.options.debugResetScope}
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(value) =>
              value && setScope(value as AppStorageClearScope)
            }
          >
            {APP_STORAGE_CLEAR_SCOPES.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {SCOPE_LABEL[value](t)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Label>
        <Label>
          {t.options.debugResetTargets}
          <ToggleGroup
            type="multiple"
            value={targets}
            onValueChange={updateTargets}
          >
            {APP_STORAGE_CLEAR_TARGETS.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {TARGET_LABEL[value](t)}
              </ToggleGroupItem>
            ))}
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
        {cleared && <Feedback>{t.options.debugResetSuccess}</Feedback>}
        {clearError && <Feedback error>{clearError}</Feedback>}
      </SettingsSection>
    </div>
  );
}

type Label = (t: Messages) => string;

const SCOPE_LABEL: Record<AppStorageClearScope, Label> = {
  all: (t) => t.options.debugResetScopeAll,
  local: (t) => t.options.debugResetScopeLocal,
  sync: (t) => t.options.debugResetScopeSync,
};

const TARGET_LABEL: Record<AppStorageClearTarget, Label> = {
  all: (t) => t.options.debugResetTargetAll,
  settings: (t) => t.options.debugResetTargetSettings,
  providers: (t) => t.options.debugResetTargetProviders,
  agents: (t) => t.options.debugResetTargetAgents,
  skills: (t) => t.options.debugResetTargetSkills,
  mcpServers: (t) => t.options.debugResetTargetMcpServers,
  localExecutionBridges: (t) => t.options.debugResetTargetLocalExecutionBridges,
  chats: (t) => t.options.debugResetTargetChats,
};
