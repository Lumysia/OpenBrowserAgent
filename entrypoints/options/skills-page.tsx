import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileArchive,
  FileText,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { QUICK_FEEDBACK_MS } from "../../src/shared/config";
import { BUILTIN_SKILLS } from "../../src/shared/builtin-skills";
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
  skillPackageBytes,
  validateSkill,
} from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import type { Skill, SkillFile } from "../../src/shared/types";
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
} from "../../src/ui/components";
import { useBuiltinSkills } from "../../src/ui/useBuiltinSkills";
import { useStoredState } from "../../src/ui/useStoredState";
import { SkillFileList, formatSkillBytes } from "./skill-options-components";
import { downloadSkillZip, importSkillZip } from "./skill-import";

export function SkillsPage() {
  const [language] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
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
  function createSkill() {
    const now = Date.now();
    const next = createSkillPackage({
      name: normalizeSkillName(t.options.untitledSkill) || "skill",
      createdAt: now,
      updatedAt: now,
    });
    setSkills((items) => [...items, next]);
    setDrafts((items) => ({ ...items, [next.id]: next }));
    setSelectedId(next.id);
  }

  async function importZip(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const skill = await importSkillZip(file, {
        missingEntry: t.options.importSkillPackageMissingEntry,
      });
      setSkills((items) => [...items, skill]);
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
    setSkills((items) =>
      items.map((item) =>
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
    setSkills((items) =>
      items.map((item) => (item.id === skill.id ? draft : item)),
    );
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
    setSkills((items) => [...items, copy]);
    setDrafts((items) => ({ ...items, [copy.id]: copy }));
    setSelectedId(copy.id);
  }

  function deleteSkill(skill: Skill) {
    if (deleteConfirmId !== skill.id) {
      setDeleteConfirmId(skill.id);
      return;
    }
    setSkills((items) => items.filter((item) => item.id !== skill.id));
    setDrafts((items) => {
      const next = { ...items };
      delete next[skill.id];
      return next;
    });
    setDeleteConfirmId(undefined);
    if (selectedId === skill.id) setSelectedId("");
  }

  function resetDefaultSkills() {
    setSkills(cloneDefault(BUILTIN_SKILLS));
    setDrafts({});
    setSelectedId("");
    setDeleteConfirmId(undefined);
  }

  return (
    <div className="skills-page stack">
      <div className="settings-page-header">
        <div>
          <h1 className="settings-page-title">
            <FileText size={24} /> {t.options.skills}
          </h1>
          <p className="muted">{t.options.skillsDescription}</p>
        </div>
        <div className="settings-page-actions">
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
      {importError && (
        <Card className="empty">
          <CardHeader>
            <CardTitle className="settings-section-title">
              <AlertCircle size={18} /> {t.options.importSkillZipError}
            </CardTitle>
            <CardDescription>{importError}</CardDescription>
          </CardHeader>
        </Card>
      )}
      {!skillList.length && (
        <Card className="empty">
          <CardHeader>
            <CardTitle className="settings-section-title">
              <FileText size={18} /> {t.options.noSkillsTitle}
            </CardTitle>
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
        {skillList.map((skill) => {
          const draft = draftFor(skill);
          const normalized = normalizeSkill(draft);
          const checks = validateSkill(normalized);
          return (
            <AccordionItem value={skill.id} key={skill.id}>
              <AccordionTrigger>
                <span className="skill-trigger-summary">
                  <span className="skill-trigger-title-row">
                    <span className="skill-trigger-label">
                      <FileText size={18} />
                      {getSkillDisplayName(skill, t.options.untitledSkill)}
                      {normalized.enabled === false && (
                        <span className="muted">{t.options.disabled}</span>
                      )}
                    </span>
                    <span className="skill-trigger-badges">
                      <Badge>
                        {t.options.updatedAt}:{" "}
                        {formatSkillDate(normalized.updatedAt)}
                      </Badge>
                      <Badge>
                        {t.options.skillSize}:{" "}
                        {formatSkillBytes(skillPackageBytes(normalized))}
                      </Badge>
                      <Badge>{skill.id}</Badge>
                    </span>
                  </span>
                  <small className="skill-checks skill-trigger-checks">
                    {checks.map((check) => (
                      <span className={check.ok ? "ok" : "warn"} key={check.id}>
                        {check.ok ? "✓" : "!"}{" "}
                        {skillCheckLabel(t, check.id, check.ok)}
                      </span>
                    ))}
                  </small>
                </span>
                <span
                  className="skill-trigger-actions"
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
                  <div className="skill-identity-panel stack">
                    <Label>
                      {t.options.title}
                      <Input
                        value={draftFor(skill).name}
                        onChange={(event) =>
                          updateSkillName(skill, event.target.value)
                        }
                      />
                    </Label>
                    <Label>
                      {t.options.description}
                      <Input
                        value={draftFor(skill).description || ""}
                        onChange={(event) =>
                          updateSkillDescription(skill, event.target.value)
                        }
                      />
                    </Label>
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
                      onClick={() => saveSkill(skill)}
                      disabled={
                        JSON.stringify(draftFor(skill)) ===
                        JSON.stringify(skill)
                      }
                    >
                      {savedId === skill.id ? <Check size={16} /> : null}
                      {savedId === skill.id ? t.common.saved : t.common.save}
                    </Button>
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
                      variant="destructiveOutline"
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
          );
        })}
      </Accordion>
      <Card>
        <CardContent>
          <div className="setting-switch-row">
            <div>
              <CardTitle className="settings-section-title">
                <RotateCcw size={18} /> {t.options.resetDefaultSkills}
              </CardTitle>
              <CardDescription>
                {t.options.resetDefaultSkillsDescription}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={resetDefaultSkills}>
              {t.options.resetDefaults}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function skillCheckLabel(
  t: ReturnType<typeof getMessages>,
  id: string,
  ok: boolean,
) {
  const labels: Record<string, string> = {
    entry: ok ? t.options.skillCheckEntry : t.options.skillCheckEntryMissing,
    name: ok ? t.options.skillCheckName : t.options.skillCheckNameInvalid,
    description: ok
      ? t.options.skillCheckDescription
      : t.options.skillCheckDescriptionMissing,
  };
  return labels[id] || id;
}

function formatSkillDate(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
