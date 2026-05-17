import { useRef, useState } from "react";
import { Check, Copy, Download, FileArchive, Plus, Trash2 } from "lucide-react";
import {
  QUICK_FEEDBACK_MS,
  SYNC_MAX_BYTES_PER_ITEM,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import {
  createSkillPackage,
  duplicateSkill,
  getSkillBody,
  getSkillDisplayName,
  normalizeSkill,
  normalizeSkillName,
  parseSkillFrontmatter,
  replaceSkillEntryFile,
  SKILL_ENTRY_PATH,
} from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import type { Skill, SkillFile } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from "../../src/ui/components";
import { useBuiltinSkills } from "../../src/ui/useBuiltinSkills";
import { useStoredState } from "../../src/ui/useStoredState";
import {
  SkillFileList,
  SkillStatusPanel,
  formatSkillBytes,
} from "./skill-options-components";
import { downloadSkillZip, importSkillZip } from "./skill-import";

export function SkillsPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [skills, setSkills] = useStoredState(storage.skills);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Skill>>({});
  const [savedId, setSavedId] = useState<string>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBuiltinSkills(skills, setSkills);

  if (!skills) return null;
  const skillList = skills ?? [];
  const t = getMessages(language);
  const totalSkillsBytes = new TextEncoder().encode(
    JSON.stringify(skillList),
  ).length;

  function createSkill() {
    const now = Date.now();
    const next = createSkillPackage({
      name: normalizeSkillName(t.options.untitledSkill) || "skill",
      createdAt: now,
      updatedAt: now,
    });
    setSkills([...skillList, next]);
    setDrafts((items) => ({ ...items, [next.id]: next }));
    setSelectedId(next.id);
  }

  async function importZip(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const skill = await importSkillZip(file);
      setSkills([...skillList, skill]);
      setSelectedId(skill.id);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function draftFor(skill: Skill) {
    return drafts[skill.id] || normalizeSkill(skill);
  }

  function updateDraft(skill: Skill, patch: Partial<Skill>) {
    setDrafts((items) => ({
      ...items,
      [skill.id]: { ...draftFor(skill), ...patch, updatedAt: Date.now() },
    }));
  }

  function updateSkillName(skill: Skill, value: string) {
    const draft = draftFor(skill);
    const name = normalizeSkillName(value);
    updateDraft(skill, {
      name,
      files: replaceSkillEntryFile(
        draft,
        name,
        draft.description,
        getSkillBody(draft),
      ),
    });
  }

  function updateSkillEnabled(skill: Skill, enabled: boolean) {
    updateDraft(skill, { enabled });
    setSkills(
      skillList.map((item) =>
        item.id === skill.id
          ? { ...draftFor(skill), enabled, updatedAt: Date.now() }
          : item,
      ),
    );
  }

  function updateSkillDescription(skill: Skill, description: string) {
    const draft = draftFor(skill);
    updateDraft(skill, {
      description,
      files: replaceSkillEntryFile(
        draft,
        draft.name,
        description,
        getSkillBody(draft),
      ),
    });
  }

  function addSkillFile(skill: Skill, file: SkillFile) {
    const draft = draftFor(skill);
    if (!file.path || draft.files.some((item) => item.path === file.path))
      return;
    updateDraft(skill, { files: [...draft.files, file] });
  }

  function replaceSkillFile(
    skill: Skill,
    file: SkillFile,
    previousPath = file.path,
  ) {
    const draft = draftFor(skill);
    if (
      previousPath !== file.path &&
      draft.files.some((item) => item.path === file.path)
    )
      return;
    const files = draft.files.map((item) =>
      item.path === previousPath ? file : item,
    );
    const metadata =
      file.path === SKILL_ENTRY_PATH
        ? parseSkillFrontmatter(file.content)
        : null;
    updateDraft(skill, {
      ...(metadata?.name ? { name: normalizeSkillName(metadata.name) } : {}),
      ...(metadata?.description ? { description: metadata.description } : {}),
      files,
    });
  }

  function deleteSkillFile(skill: Skill, path: string) {
    if (path === SKILL_ENTRY_PATH) return;
    updateDraft(skill, {
      files: draftFor(skill).files.filter((file) => file.path !== path),
    });
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

  function duplicateCurrentSkill(skill: Skill) {
    const copy = duplicateSkill(
      draftFor(skill),
      skillList.map((item) => normalizeSkill(item).name),
    );
    setSkills([...skillList, copy]);
    setDrafts((items) => ({ ...items, [copy.id]: copy }));
    setSelectedId(copy.id);
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
        <div className="row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.skill,application/zip"
            hidden
            onChange={(event) => importZip(event.target.files)}
          />
          <Button
            variant="outline"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileArchive size={16} />
            {importing ? t.options.importingSkillZip : t.options.importSkillZip}
          </Button>
          <Button onClick={createSkill}>
            <Plus size={16} /> {t.options.newSkill}
          </Button>
        </div>
      </div>
      {preferences && (
        <Card>
          <CardContent>
            <div className="setting-switch-row">
              <div>
                <CardTitle>{t.options.autoSelectSkills}</CardTitle>
                <CardDescription>
                  {t.options.autoSelectSkillsDescription}
                </CardDescription>
                <CardDescription>
                  {t.options.totalSkillsSize}:{" "}
                  {formatSkillBytes(totalSkillsBytes)}
                </CardDescription>
              </div>
              <Switch
                checked={preferences.autoSelectSkills === true}
                onCheckedChange={(autoSelectSkills) =>
                  setPreferences({ ...preferences, autoSelectSkills })
                }
              />
            </div>
          </CardContent>
          {preferences.syncSkills &&
            totalSkillsBytes > SYNC_MAX_BYTES_PER_ITEM && (
              <CardContent>
                <div className="skill-warning">
                  {t.options.syncQuotaWarning}
                </div>
              </CardContent>
            )}
        </Card>
      )}
      {importError && (
        <Card className="empty">
          <CardHeader>
            <CardTitle>{t.options.importSkillZipError}</CardTitle>
            <CardDescription>{importError}</CardDescription>
          </CardHeader>
        </Card>
      )}
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
              <span className="row">
                {getSkillDisplayName(skill, t.options.untitledSkill)}
                {normalizeSkill(skill).enabled === false && (
                  <span className="muted">{t.options.disabled}</span>
                )}
              </span>
              <span
                className="row"
                onClick={(event) => event.stopPropagation()}
              >
                <Switch
                  checked={normalizeSkill(skill).enabled !== false}
                  onCheckedChange={(enabled) =>
                    updateSkillEnabled(skill, enabled)
                  }
                />
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="skill-detail stack">
                <SkillStatusPanel skill={draftFor(skill)} />
                <div className="skill-identity-panel stack">
                  <Label>
                    {t.options.description}
                    <Input
                      value={draftFor(skill).description || ""}
                      onChange={(event) =>
                        updateSkillDescription(skill, event.target.value)
                      }
                    />
                  </Label>
                  <Label>
                    {t.options.title}
                    <Input
                      value={draftFor(skill).name}
                      onChange={(event) =>
                        updateSkillName(skill, event.target.value)
                      }
                    />
                  </Label>
                  <div className="row">
                    <Button
                      onClick={() => saveSkill(skill)}
                      disabled={
                        JSON.stringify(draftFor(skill)) ===
                        JSON.stringify(skill)
                      }
                    >
                      {savedId === skill.id ? <Check size={16} /> : null}
                      {savedId === skill.id ? t.common.saved : t.common.save}
                    </Button>
                  </div>
                </div>
                <SkillFileList
                  skill={draftFor(skill)}
                  onAddFile={(file) => addSkillFile(skill, file)}
                  onReplaceFile={(file, previousPath) =>
                    replaceSkillFile(skill, file, previousPath)
                  }
                  onDeleteFile={(path) => deleteSkillFile(skill, path)}
                />
                <div className="row">
                  <Button
                    variant="outline"
                    onClick={() => duplicateCurrentSkill(skill)}
                  >
                    <Copy size={16} /> {t.options.duplicateSkill}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => downloadSkillZip(draftFor(skill), "skill")}
                  >
                    <Download size={16} /> {t.options.downloadSkillPackage}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!!skill.builtin}
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
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
