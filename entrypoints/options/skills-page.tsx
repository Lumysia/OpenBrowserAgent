import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import {
  COPY_FEEDBACK_MS,
  ISO_DATE_LENGTH,
  QUICK_FEEDBACK_MS,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { CHAT_MODE, type Skill } from "../../src/shared/types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function SkillsPage() {
  const [language] = useStoredState(storage.language);
  const [skills, setSkills] = useStoredState(storage.skills);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Skill>>({});
  const [savedId, setSavedId] = useState<string>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>();
  if (!skills) return null;
  const skillList = skills ?? [];
  const t = getMessages(language);

  function createSkill() {
    const now = Date.now();
    const next: Skill = {
      id: crypto.randomUUID(),
      title: t.options.untitledSkill,
      description: "",
      instruction: "",
      mode: CHAT_MODE.ask,
      createdAt: now,
      updatedAt: now,
    };
    setSkills([...skillList, next]);
    setDrafts((items) => ({ ...items, [next.id]: next }));
    setSelectedId(next.id);
  }

  function draftFor(skill: Skill) {
    return drafts[skill.id] || skill;
  }

  function updateDraft(skill: Skill, patch: Partial<Skill>) {
    setDrafts((items) => ({
      ...items,
      [skill.id]: { ...draftFor(skill), ...patch, updatedAt: Date.now() },
    }));
  }

  function saveSkill(skill: Skill) {
    const draft = draftFor(skill);
    setSkills(skillList.map((item) => (item.id === skill.id ? draft : item)));
    setSavedId(skill.id);
    setTimeout(
      () => setSavedId((id) => (id === skill.id ? undefined : id)),
      QUICK_FEEDBACK_MS,
    );
  }

  function deleteSkill(skill: Skill) {
    if (deleteConfirmId !== skill.id) {
      setDeleteConfirmId(skill.id);
      return;
    }
    setSkills(skillList.filter((item) => item.id !== skill.id));
    setDrafts((items) => {
      const next = { ...items };
      delete next[skill.id];
      return next;
    });
    setDeleteConfirmId(undefined);
    if (selectedId === skill.id) setSelectedId("");
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1>{t.options.skills}</h1>
          <p className="muted">{t.options.skillsDescription}</p>
        </div>
        <Button onClick={createSkill}>
          <Plus size={16} /> {t.options.newSkill}
        </Button>
      </div>
      {!skillList.length && (
        <Card className="empty">
          <CardHeader>
            <CardTitle>{t.options.noSkillsTitle}</CardTitle>
            <CardDescription>{t.options.noSkillsDescription}</CardDescription>
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
        {skillList.map((skill) => (
          <AccordionItem value={skill.id} key={skill.id}>
            <AccordionTrigger>
              {skill.title || t.options.untitledSkill}
            </AccordionTrigger>
            <AccordionContent className="stack">
              <Label>
                {t.options.title}
                <Input
                  style={{ maxWidth: 400 }}
                  value={draftFor(skill).title}
                  onChange={(event) =>
                    updateDraft(skill, { title: event.target.value })
                  }
                />
              </Label>
              <Label>
                {t.options.description}
                <Input
                  style={{ maxWidth: 600 }}
                  value={draftFor(skill).description || ""}
                  onChange={(event) =>
                    updateDraft(skill, { description: event.target.value })
                  }
                />
              </Label>
              <Label>
                {t.options.mode}
                <Select
                  value={draftFor(skill).mode || CHAT_MODE.ask}
                  onValueChange={(mode) =>
                    updateDraft(skill, { mode: mode as Skill["mode"] })
                  }
                >
                  <SelectTrigger style={{ maxWidth: 240 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CHAT_MODE.ask}>{t.words.ask}</SelectItem>
                    <SelectItem value={CHAT_MODE.agent}>
                      {t.words.agent}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Label>
                {t.options.instruction}
                <Textarea
                  style={{ maxWidth: 600, minHeight: 150 }}
                  value={draftFor(skill).instruction}
                  onChange={(event) =>
                    updateDraft(skill, { instruction: event.target.value })
                  }
                />
              </Label>
              <SkillVariables />
              <div className="row">
                <Button
                  onClick={() => saveSkill(skill)}
                  disabled={
                    JSON.stringify(draftFor(skill)) === JSON.stringify(skill)
                  }
                >
                  {savedId === skill.id ? <Check size={16} /> : null}
                  {savedId === skill.id ? t.common.saved : t.common.save}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteSkill(skill)}
                >
                  <Trash2 size={16} />{" "}
                  {deleteConfirmId === skill.id
                    ? t.common.confirm
                    : t.options.deleteSkill}
                </Button>
                {deleteConfirmId === skill.id && (
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

function SkillVariables() {
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
