import { Check, Copy, Download, RotateCcw, Trash2 } from "lucide-react";
import { SKILL_FILES } from "../../src/shared/sync/collections";
import { useNotSyncedHere } from "../../src/ui/useSyncedHere";
import {
  getSkillBody,
  normalizeSkillName,
  parseSkillFrontmatter,
  replaceSkillEntryFile,
  SKILL_ENTRY_PATH,
} from "../../src/shared/skills";
import type { Skill, SkillFile } from "../../src/shared/types";
import {
  Button,
  Feedback,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ConfirmButton,
} from "../../src/ui/components";
import { skillDisplay } from "../../src/ui/skill-display";
import { downloadSkillZip } from "./skill-import";
import { SkillFileList } from "./skill-options-components";
import { useMessages } from "../../src/ui/messages";

// The editor of a user skill or a user's copy of a built-in (`override`).
// The draft lives with the page so it survives collapsing the item.
export function SkillEditor({
  skill,
  draft,
  override,
  saved,
  onDraft,
  onSave,
  onDuplicate,
  onDelete,
}: {
  skill: Skill;
  draft: Skill;
  override: boolean;
  saved: boolean;
  onDraft: (draft: Skill) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useMessages();
  const filesNotSynced = useNotSyncedHere(SKILL_FILES);
  const update = (patch: Partial<Skill>) =>
    onDraft({ ...draft, ...patch, updatedAt: Date.now() });
  const withEntry = (name: string, description: string) => ({
    name,
    description,
    files: replaceSkillEntryFile(draft, name, description, getSkillBody(draft)),
  });

  function replaceFile(file: SkillFile, previousPath = file.path) {
    if (
      previousPath !== file.path &&
      draft.files.some((item) => item.path === file.path)
    )
      return;
    const metadata =
      file.path === SKILL_ENTRY_PATH
        ? parseSkillFrontmatter(file.content)
        : null;
    update({
      ...(metadata?.name ? { name: normalizeSkillName(metadata.name) } : {}),
      ...(metadata?.description ? { description: metadata.description } : {}),
      files: draft.files.map((item) =>
        item.path === previousPath ? file : item,
      ),
    });
  }

  return (
    <div className="skill-detail stack">
      <div className="skill-identity-panel stack">
        <Label>
          {t.options.title}
          <Input
            value={draft.name}
            onChange={(event) =>
              update(
                withEntry(
                  normalizeSkillName(event.target.value),
                  draft.description,
                ),
              )
            }
          />
        </Label>
        <Label>
          {t.options.description}
          <Input
            value={draft.description || ""}
            onChange={(event) =>
              update(withEntry(draft.name, event.target.value))
            }
          />
        </Label>
      </div>
      {filesNotSynced && <Feedback>{t.sync.filesNotSynced}</Feedback>}
      <SkillFileList
        skill={draft}
        onAddFile={(file) => {
          if (!file.path || draft.files.some((item) => item.path === file.path))
            return;
          update({ files: [...draft.files, file] });
        }}
        onReplaceFile={replaceFile}
        onDeleteFile={(path) => {
          if (path === SKILL_ENTRY_PATH) return;
          update({ files: draft.files.filter((file) => file.path !== path) });
        }}
      />
      <div className="row">
        <Button
          onClick={onSave}
          disabled={JSON.stringify(draft) === JSON.stringify(skill)}
        >
          {saved ? <Check size={16} /> : null}
          {saved ? t.common.saved : t.common.save}
        </Button>
        {!override && (
          <Button variant="outline" onClick={onDuplicate}>
            <Copy size={16} /> {t.options.duplicateSkill}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => downloadSkillZip(draft, "skill")}
        >
          <Download size={16} /> {t.options.downloadSkillPackage}
        </Button>
        <ConfirmButton
          confirmLabel={t.common.confirm}
          cancelLabel={t.common.cancel}
          onConfirm={onDelete}
        >
          {override ? <RotateCcw size={16} /> : <Trash2 size={16} />}{" "}
          {override ? t.options.revertSkillToBuiltin : t.options.deleteSkill}
        </ConfirmButton>
      </div>
    </div>
  );
}

// A built-in skill: read-only; "Customise" makes the user's own copy.
export function BuiltinSkillDetail({
  skill,
  onCustomize,
}: {
  skill: Skill;
  onCustomize: () => void;
}) {
  const t = useMessages();
  return (
    <div className="skill-detail stack">
      <p className="muted">{skillDisplay(skill, t).description}</p>
      <SkillFileList skill={skill} />
      <div className="row">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onCustomize}>
              <Copy size={16} /> {t.options.customizeSkill}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.options.customizeSkillHint}</TooltipContent>
        </Tooltip>
        <Button
          variant="outline"
          onClick={() => downloadSkillZip(skill, "skill")}
        >
          <Download size={16} /> {t.options.downloadSkillPackage}
        </Button>
      </div>
    </div>
  );
}
