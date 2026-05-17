import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import {
  COPY_FEEDBACK_MS,
  ISO_DATE_LENGTH,
  QUICK_FEEDBACK_MS,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { QuickAction } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function QuickActionsPage() {
  const [language] = useStoredState(storage.language);
  const [actions, setActions] = useStoredState(storage.quickAction);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, QuickAction>>({});
  const [savedId, setSavedId] = useState<string>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>();
  if (!actions) return null;
  const actionList = actions ?? [];
  const t = getMessages(language);

  function createAction() {
    const next: QuickAction = {
      id: crypto.randomUUID(),
      title: t.options.untitledAction,
      instruction: "",
    };
    setActions([...actionList, next]);
    setDrafts((items) => ({ ...items, [next.id]: next }));
    setSelectedId(next.id);
  }

  function draftFor(action: QuickAction) {
    return drafts[action.id] || action;
  }

  function updateDraft(action: QuickAction, patch: Partial<QuickAction>) {
    setDrafts((items) => ({
      ...items,
      [action.id]: { ...draftFor(action), ...patch },
    }));
  }

  function saveAction(action: QuickAction) {
    const draft = draftFor(action);
    setActions(
      actionList.map((item) => (item.id === action.id ? draft : item)),
    );
    setSavedId(action.id);
    setTimeout(
      () => setSavedId((id) => (id === action.id ? undefined : id)),
      QUICK_FEEDBACK_MS,
    );
  }

  function deleteAction(action: QuickAction) {
    if (deleteConfirmId !== action.id) {
      setDeleteConfirmId(action.id);
      return;
    }
    setActions(actionList.filter((item) => item.id !== action.id));
    setDrafts((items) => {
      const next = { ...items };
      delete next[action.id];
      return next;
    });
    setDeleteConfirmId(undefined);
    if (selectedId === action.id) setSelectedId("");
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1>{t.options.quickActions}</h1>
          <p className="muted">{t.options.quickActionsDescription}</p>
        </div>
        <Button onClick={createAction}>
          <Plus size={16} /> {t.options.newQuickAction}
        </Button>
      </div>
      {!actionList.length && (
        <Card className="empty">
          <CardHeader>
            <CardTitle>{t.options.noQuickActionsTitle}</CardTitle>
            <CardDescription>
              {t.options.noQuickActionsDescription}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <Accordion
        type="single"
        collapsible
        value={selectedId}
        onValueChange={setSelectedId}
        className="stack"
      >
        {actionList.map((action) => (
          <AccordionItem value={action.id} key={action.id}>
            <AccordionTrigger>
              {action.title || t.options.untitledAction}
            </AccordionTrigger>
            <AccordionContent className="stack">
              <Label>
                {t.options.title}
                <Input
                  style={{ maxWidth: 400 }}
                  value={draftFor(action).title}
                  onChange={(event) =>
                    updateDraft(action, { title: event.target.value })
                  }
                />
              </Label>
              <Label>
                {t.options.instruction}
                <Textarea
                  style={{ maxWidth: 600, minHeight: 150 }}
                  value={draftFor(action).instruction}
                  onChange={(event) =>
                    updateDraft(action, { instruction: event.target.value })
                  }
                />
              </Label>
              <QuickActionVariables />
              <div className="row">
                <Button
                  onClick={() => saveAction(action)}
                  disabled={
                    JSON.stringify(draftFor(action)) === JSON.stringify(action)
                  }
                >
                  {savedId === action.id ? <Check size={16} /> : null}
                  {savedId === action.id ? t.common.saved : t.common.save}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteAction(action)}
                >
                  <Trash2 size={16} />{" "}
                  {deleteConfirmId === action.id
                    ? t.common.confirm
                    : t.options.deleteQuickAction}
                </Button>
                {deleteConfirmId === action.id && (
                  <Button
                    variant="secondary"
                    onClick={() => setDeleteConfirmId(undefined)}
                  >
                    {t.common.cancel}
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function QuickActionVariables() {
  const [language] = useStoredState(storage.language);
  const [copied, setCopied] = useState(false);
  const t = getMessages(language);
  async function copyDateToken() {
    await navigator.clipboard.writeText("{{ date }}").catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }
  return (
    <div className="stack">
      <span className="muted">{t.options.availableVariables}</span>
      <div className="row">
        <Button variant="outline" size="sm" onClick={copyDateToken}>
          {copied ? <Check size={14} /> : null}
          {"{{ date }}"}
        </Button>
        <span className="muted">
          {t.options.example}:{" "}
          {new Date().toISOString().slice(0, ISO_DATE_LENGTH)}
        </span>
      </div>
    </div>
  );
}
