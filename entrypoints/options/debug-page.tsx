import { useState } from "react";
import { AlertTriangle, Bug, Wrench, Trash2 } from "lucide-react";
import { browserTools } from "../../src/background/tool-schema";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { isSkillEnabled } from "../../src/shared/skills";
import {
  clearAppStorage,
  type AppStorageClearScope,
  type AppStorageClearTarget,
} from "../../src/shared/storage-debug";
import { storage } from "../../src/shared/storage";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
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
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function DebugPage() {
  const [language] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const [skills] = useStoredState(storage.skills);
  const [confirmText, setConfirmText] = useState("");
  const [scope, setScope] = useState<AppStorageClearScope>("all");
  const [targets, setTargets] = useState<AppStorageClearTarget[]>(["all"]);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const t = getMessages(language);
  const toolRows = browserTools.map((tool) =>
    toolStatus({
      name: tool.function.name,
      preferences,
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
                  String(browserTools.length),
                )}
              </small>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Accordion type="multiple" className="debug-tool-list">
              {browserTools.map((tool, index) => {
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
          <CardTitle className="debug-section-title">
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
              <ToggleGroupItem value="skills">
                {t.options.debugResetTargetSkills}
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
            variant="destructive"
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

function toolStatus({
  name,
  preferences,
  enabledSkillCount,
  t,
}: {
  name: string;
  preferences: Awaited<ReturnType<typeof storage.preferences.get>> | undefined;
  enabledSkillCount: number;
  t: ReturnType<typeof getMessages>;
}) {
  if ((preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS) <= 0)
    return { enabled: false, reason: t.options.debugToolStepsDisabled };
  if (name === BROWSER_TOOL_NAME.generateImage)
    return preferences?.imageGenerationEnabled
      ? { enabled: true, reason: t.options.debugToolImageGenerationEnabled }
      : { enabled: false, reason: t.options.debugToolImageGenerationDisabled };
  if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
    return { enabled: false, reason: t.options.debugToolAttachmentsRequired };
  if (
    name === BROWSER_TOOL_NAME.listSkills ||
    name === BROWSER_TOOL_NAME.readSkill ||
    name === BROWSER_TOOL_NAME.readSkillFile ||
    name === BROWSER_TOOL_NAME.updateSkillFile
  )
    return enabledSkillCount && preferences?.autoSelectSkills
      ? { enabled: true, reason: t.options.debugToolSkillsEnabled }
      : { enabled: false, reason: t.options.debugToolSkillsDisabled };
  if (name === BROWSER_TOOL_NAME.readFileFromUrl)
    return { enabled: true, reason: t.options.debugToolAlwaysAvailable };
  return { enabled: true, reason: t.options.debugToolAgentModeAvailable };
}
