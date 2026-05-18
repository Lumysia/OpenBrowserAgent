import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import {
  clearAppStorage,
  type AppStorageClearScope,
  type AppStorageClearTarget,
} from "../../src/shared/storage-debug";
import { storage } from "../../src/shared/storage";
import {
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
  const [confirmText, setConfirmText] = useState("");
  const [scope, setScope] = useState<AppStorageClearScope>("all");
  const [targets, setTargets] = useState<AppStorageClearTarget[]>(["all"]);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const t = getMessages(language);
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
        <h1>{t.options.debug}</h1>
        <p className="muted">{t.options.debugDescription}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <AlertTriangle size={18} /> {t.options.debugResetTitle}
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
