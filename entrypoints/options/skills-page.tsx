import { useRef, useState } from "react";
import { AlertCircle, FileArchive, FileText, Plus } from "lucide-react";
import {
  QUICK_FEEDBACK_MS,
  SKILL_LISTING_MAX_CHARS,
} from "../../src/shared/config";
import { getMessages, type Messages } from "../../src/shared/i18n";
import {
  customizeBuiltinSkill,
  forgetSkillSettings,
  inheritSkillSettings,
  listedSkills,
  setSkillInvokeMode,
  SKILL_INVOKE_MODES,
  skillListingSize,
  type SkillEntry,
} from "../../src/shared/skill-catalog";
import {
  createSkillPackage,
  duplicateSkill,
  getSkillDisplayName,
  normalizeSkill,
  normalizeSkillName,
  skillPackageBytes,
  validateSkill,
} from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import type { Skill, SkillInvokeMode } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionHeader,
  AccordionTriggerButton,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useSkillCatalog } from "../../src/ui/useSkillCatalog";
import { useStoredState } from "../../src/ui/useStoredState";
import { BuiltinSkillDetail, SkillEditor } from "./skill-editor";
import { importSkillZip } from "./skill-import";
import { formatSkillBytes } from "./skill-options-components";

export function SkillsPage() {
  const [language] = useStoredState(storage.language);
  const { entries, setSkills, setSettings } = useSkillCatalog();
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Skill>>({});
  const [savedId, setSavedId] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!entries) return null;
  const t = getMessages(language);
  const listing = skillListingSize(listedSkills(entries));

  function addSkill(skill: Skill) {
    setSkills((items) => [...items, skill]);
    setDrafts((items) => ({ ...items, [skill.id]: skill }));
    setSelectedId(skill.id);
  }

  async function importZip(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      addSkill(
        await importSkillZip(file, {
          missingEntry: t.options.importSkillPackageMissingEntry,
        }),
      );
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

  function customize(builtin: Skill) {
    const skill = customizeBuiltinSkill(builtin);
    addSkill(skill);
    setSettings((settings) =>
      inheritSkillSettings(settings, builtin.id, skill.id),
    );
  }

  // Deleting a user's copy of a built-in brings the built-in back.
  function deleteSkill(entry: SkillEntry) {
    const { skill } = entry;
    setSkills((items) => items.filter((item) => item.id !== skill.id));
    setSettings((settings) => forgetSkillSettings(settings, skill.id));
    setDrafts((items) => {
      const next = { ...items };
      delete next[skill.id];
      return next;
    });
    setSelectedId("");
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
          <Button
            onClick={() =>
              addSkill(
                createSkillPackage({
                  name: normalizeSkillName(t.options.untitledSkill) || "skill",
                }),
              )
            }
          >
            <Plus size={16} /> {t.options.newSkill}
          </Button>
        </div>
      </div>
      {listing.overBudget && (
        <Notice
          title={t.options.skillListOverBudget}
          description={t.options.skillListOverBudgetDescription
            .replace("{chars}", String(listing.chars))
            .replace("{limit}", String(SKILL_LISTING_MAX_CHARS))}
        />
      )}
      {importError && (
        <Notice
          title={t.options.importSkillZipError}
          description={importError}
        />
      )}
      <Accordion
        type="single"
        collapsible
        value={selectedId}
        onValueChange={setSelectedId}
        className="stack"
      >
        {entries.map((entry) => {
          const { skill, source } = entry;
          return (
            <AccordionItem value={skill.id} key={skill.id}>
              <SkillItemHeader
                t={t}
                entry={entry}
                draft={draftFor(skill)}
                onInvoke={(mode) =>
                  setSettings((settings) =>
                    setSkillInvokeMode(settings, skill.id, mode),
                  )
                }
              />
              <AccordionContent>
                {source === "builtin" ? (
                  <BuiltinSkillDetail
                    t={t}
                    skill={skill}
                    onCustomize={() => customize(skill)}
                  />
                ) : (
                  <SkillEditor
                    t={t}
                    skill={skill}
                    draft={draftFor(skill)}
                    override={source === "override"}
                    saved={savedId === skill.id}
                    onDraft={(draft) =>
                      setDrafts((items) => ({ ...items, [skill.id]: draft }))
                    }
                    onSave={() => saveSkill(skill)}
                    onDuplicate={() =>
                      addSkill(
                        duplicateSkill(
                          draftFor(skill),
                          entries.map((item) => item.skill.name),
                        ),
                      )
                    }
                    onDelete={() => deleteSkill(entry)}
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function SkillItemHeader({
  t,
  entry,
  draft,
  onInvoke,
}: {
  t: Messages;
  entry: SkillEntry;
  draft: Skill;
  onInvoke: (mode: SkillInvokeMode) => void;
}) {
  const { skill, source, invoke } = entry;
  const name = getSkillDisplayName(skill, t.options.untitledSkill);
  const checks = source === "builtin" ? [] : validateSkill(draft);
  return (
    <AccordionHeader className="ui-accordion-header-with-actions">
      <AccordionTriggerButton hideChevron>
        <span className="skill-trigger-summary">
          <span className="skill-trigger-title-row">
            <span className="skill-trigger-label">
              <FileText size={18} />
              {name}
            </span>
            <span className="skill-trigger-badges">
              {source !== "user" && (
                <Badge>
                  {source === "builtin"
                    ? t.options.builtinSkillBadge
                    : t.options.overrideSkillBadge}
                </Badge>
              )}
              {source !== "builtin" && (
                <Badge>
                  {t.options.updatedAt}: {formatSkillDate(draft.updatedAt)}
                </Badge>
              )}
              <Badge>
                {t.options.skillSize}:{" "}
                {formatSkillBytes(skillPackageBytes(draft))}
              </Badge>
            </span>
          </span>
          {!!checks.length && (
            <small className="skill-checks skill-trigger-checks">
              {checks.map((check) => (
                <span className={check.ok ? "ok" : "warn"} key={check.id}>
                  {check.ok ? "✓" : "!"}{" "}
                  {skillCheckLabel(t, check.id, check.ok)}
                </span>
              ))}
            </small>
          )}
        </span>
      </AccordionTriggerButton>
      <span className="accordion-trigger-actions">
        <ToggleGroup
          type="single"
          size="sm"
          aria-label={`${name}: ${t.options.skillInvokeMode}`}
          value={invoke}
          onValueChange={(mode) => mode && onInvoke(mode as SkillInvokeMode)}
        >
          {SKILL_INVOKE_MODES.map((mode) => (
            <ToggleGroupItem
              key={mode}
              value={mode}
              tooltip={skillInvokeHint(t, mode)}
            >
              {skillInvokeLabel(t, mode)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </span>
      <AccordionTriggerButton
        className="accordion-chevron-trigger"
        aria-label={name}
      />
    </AccordionHeader>
  );
}

function Notice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="empty">
      <CardHeader>
        <CardTitle className="settings-section-title">
          <AlertCircle size={18} /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function skillInvokeLabel(t: Messages, mode: SkillInvokeMode) {
  return {
    auto: t.options.skillInvokeAuto,
    manual: t.options.skillInvokeManual,
    off: t.options.skillInvokeOff,
  }[mode];
}

function skillInvokeHint(t: Messages, mode: SkillInvokeMode) {
  return {
    auto: t.options.skillInvokeAutoHint,
    manual: t.options.skillInvokeManualHint,
    off: t.options.skillInvokeOffHint,
  }[mode];
}

function skillCheckLabel(t: Messages, id: string, ok: boolean) {
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
