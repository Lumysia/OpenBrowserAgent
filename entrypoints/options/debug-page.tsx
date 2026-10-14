import { useEffect, useState } from "react";
import { AlertTriangle, Bug, Wrench, Trash2 } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import { resolveAgent } from "../../src/shared/agents";
import {
  describeRun,
  type RunDescription,
} from "../../src/shared/run-description";
import {
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Feedback,
  Label,
  SettingSwitchCard,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { errorWithDetail } from "../../src/ui/error-text";

export function DebugPage() {
  const [language] = useStoredState(storage.language);
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
      <div>
        <h1 className="settings-page-title">
          <Bug size={24} /> {t.options.debug}
        </h1>
        <p className="muted">{t.options.debugDescription}</p>
      </div>
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
          {cleared && <Feedback>{t.options.debugResetSuccess}</Feedback>}
          {clearError && <Feedback error>{clearError}</Feedback>}
        </CardContent>
      </Card>
    </div>
  );
}
