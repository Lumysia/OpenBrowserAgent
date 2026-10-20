import {
  RECORDED_SKILL_STATUS,
  recordedSkillInfo,
} from "../../src/shared/teach/skill-files";
import {
  leaveSidePanelHandoff,
  SIDE_PANEL_TASK,
} from "../../src/shared/side-panel-handoff";
import { openSidePanelIn } from "../../src/shared/side-panel";
import { useCurrentWindowId } from "../../src/ui/use-current-window-id";
import { useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  FileArchive,
  FileText,
  Plus,
} from "lucide-react";
import { SKILL_LISTING_MAX_CHARS } from "../../src/shared/config";
import { type Messages } from "../../src/shared/i18n";
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
  normalizeSkill,
  normalizeSkillName,
  skillPackageBytes,
  skillTooLarge,
  validateSkill,
} from "../../src/shared/skills";
import { formatBytes, formatDateTime } from "../../src/shared/format";
import type { Skill, SkillInvokeMode } from "../../src/shared/types";
import {
  Accordion,
  Badge,
  Button,
  ToggleGroup,
  ToggleGroupItem,
  SettingsPageHeader,
  SettingsSection,
  SettingsAccordionItem,
} from "../../src/ui/components";
import { skillDisplay, skillTooLargeText } from "../../src/ui/skill-display";
import { SKILL_FILES } from "../../src/shared/sync/collections";
import { useSkillCatalog } from "../../src/ui/useSkillCatalog";
import { useNotSyncedHere } from "../../src/ui/useSyncedHere";
import { BuiltinSkillDetail, SkillEditor } from "./skill-editor";
import { importSkillZip } from "./skill-import";
import { guardSkillEdit } from "../../src/shared/teach/skill-files";
import { importErrorDetail } from "./import-errors";
import { useTransient } from "../../src/ui/use-transient";
import { useLocale, useMessages } from "../../src/ui/messages";
import { revealElement } from "../../src/ui/reveal";

const skillElementId = (skillId: string) => `skill-${skillId}`;

export function SkillsPage() {
  const { entries, setSkills, setSettings } = useSkillCatalog();
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Skill>>({});
  const [savedId, showSaved] = useTransient<string>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const windowId = useCurrentWindowId();

  if (!entries) return null;
  const t = useMessages();
  const listing = skillListingSize(listedSkills(entries));

  function addSkill(skill: Skill) {
    setSkills((items) => [...items, skill]);
    setDrafts((items) => ({ ...items, [skill.id]: skill }));
    setSelectedId(skill.id);
    revealElement(skillElementId(skill.id));
  }

  async function importZip(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      addSkill(guardSkillEdit(undefined, await importSkillZip(file)));
    } catch (error) {
      setImportError(importErrorDetail(error, t));
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
    // The header's checks say why.
    if (skillTooLarge(draft)) return;
    setSkills((items) =>
      items.map((item) =>
        item.id === skill.id ? guardSkillEdit(item, draft) : item,
      ),
    );
    showSaved(skill.id);
  }

  // A recorded draft is checked in the side panel: opened during the click,
  // which then runs the check (use-side-panel-handoff.ts).
  function checkAgain(skill: Skill) {
    openSidePanelIn(windowId).catch((error: unknown) =>
      console.warn("Failed to open the side panel", error),
    );
    void leaveSidePanelHandoff(
      { task: SIDE_PANEL_TASK.checkSkill, skillId: skill.id },
      { windowId },
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
      <SettingsPageHeader
        icon={<FileText />}
        title={t.options.skills}
        description={`${t.options.skillsDescription} ${t.teach.skillsHint}`}
        actions={
          <>
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
              {importing
                ? t.options.importingSkillZip
                : t.options.importSkillZip}
            </Button>
            <Button
              onClick={() =>
                addSkill(
                  createSkillPackage({
                    name:
                      normalizeSkillName(t.options.untitledSkill) || "skill",
                  }),
                )
              }
            >
              <Plus size={16} /> {t.options.newSkill}
            </Button>
          </>
        }
      />
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
            <SkillItem
              key={skill.id}
              entry={entry}
              draft={draftFor(skill)}
              onInvoke={(mode) =>
                setSettings((settings) =>
                  setSkillInvokeMode(settings, skill.id, mode),
                )
              }
            >
              {source === "builtin" ? (
                <BuiltinSkillDetail
                  skill={skill}
                  onCustomize={() => customize(skill)}
                />
              ) : (
                <SkillEditor
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
                  {...(recordedSkillInfo(skill)?.status ===
                  RECORDED_SKILL_STATUS.draft
                    ? { onCheck: () => checkAgain(skill) }
                    : {})}
                />
              )}
            </SkillItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function SkillItem({
  entry,
  draft,
  onInvoke,
  children,
}: {
  entry: SkillEntry;
  draft: Skill;
  onInvoke: (mode: SkillInvokeMode) => void;
  children: ReactNode;
}) {
  const t = useMessages();
  const locale = useLocale();
  const { skill, source, invoke } = entry;
  const { name } = skillDisplay(skill, t);
  const recorded = recordedSkillInfo(draft);
  const filesNotSynced = useNotSyncedHere(SKILL_FILES);
  // A skill whose files did not sync to this device is not broken.
  const checks =
    source === "builtin" || (filesNotSynced && !draft.files.length)
      ? []
      : validateSkill(draft);
  return (
    <SettingsAccordionItem
      id={skillElementId(skill.id)}
      value={skill.id}
      chevronLabel={name}
      summary={
        <span className="skill-trigger-summary">
          <span className="skill-trigger-title-row">
            <span className="skill-trigger-label">
              <FileText size={18} />
              <span className="settings-summary-name" title={name}>
                {name}
              </span>
            </span>
            <span className="skill-trigger-badges">
              {source !== "user" && (
                <Badge>
                  {source === "builtin"
                    ? t.options.builtinSkillBadge
                    : t.options.overrideSkillBadge}
                </Badge>
              )}
              {recorded && (
                <Badge>
                  {t.teach.status.recorded} · {t.teach.status[recorded.status]}
                </Badge>
              )}
              {source !== "builtin" && (
                <Badge>
                  {t.options.updatedAt}:{" "}
                  {formatSkillDate(locale, draft.updatedAt)}
                </Badge>
              )}
              <Badge>
                {t.options.skillSize}:{" "}
                {formatBytes(locale, skillPackageBytes(draft), "kb")}
              </Badge>
            </span>
          </span>
          {!!checks.length && (
            <small className="skill-checks skill-trigger-checks">
              {checks.map((check) => (
                <span className={check.ok ? "ok" : "warn"} key={check.id}>
                  {check.ok ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <AlertTriangle size={12} aria-hidden />
                  )}
                  {skillCheckLabel(t, check.id, check.ok)}
                </span>
              ))}
            </small>
          )}
        </span>
      }
      actions={
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
              tooltip={t.options.skillInvoke[mode].hint}
            >
              {t.options.skillInvoke[mode].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {children}
    </SettingsAccordionItem>
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
    <SettingsSection
      className="empty"
      icon={<AlertCircle />}
      title={title}
      description={description}
    />
  );
}

function skillCheckLabel(t: Messages, id: string, ok: boolean) {
  const labels: Record<string, { ok: string; failed: string }> =
    t.options.skillCheck;
  if (!Object.hasOwn(labels, id)) return id;
  if (ok) return labels[id].ok;
  return id === "size" ? skillTooLargeText(t) : labels[id].failed;
}

function formatSkillDate(locale: string, value?: number) {
  return value ? formatDateTime(locale, value) : "-";
}
