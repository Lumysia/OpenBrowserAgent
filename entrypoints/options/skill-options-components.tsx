import { useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  FileArchive,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  COPY_FEEDBACK_MS,
  ISO_DATE_LENGTH,
  SYNC_MAX_BYTES_PER_ITEM,
} from "../../src/shared/config";
import { getMessages } from "../../src/shared/i18n";
import {
  normalizeSkill,
  normalizeSkillName,
  SKILL_ENTRY_PATH,
  skillPackageBytes,
  validateSkill,
} from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import type { Skill, SkillFile } from "../../src/shared/types";
import { Button, Input, Switch } from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import {
  createEmptySkillFile,
  downloadSkillFile,
  readReplacementSkillFile,
} from "./skill-import";

export function SkillVariables() {
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

export function SkillStatusPanel({
  skill,
  allSkills,
  onPatch,
}: {
  skill: Skill;
  allSkills: Skill[];
  onPatch: (patch: Partial<Skill>) => void;
}) {
  const [language] = useStoredState(storage.language);
  const [preferences] = useStoredState(storage.preferences);
  const [triggerPrompt, setTriggerPrompt] = useState("");
  const t = getMessages(language);
  const normalized = normalizeSkill(skill);
  const checks = validateSkill(normalized);
  const failed = checks.filter((check) => !check.ok);
  const skillBytes = skillPackageBytes(normalized);
  const totalBytes = new TextEncoder().encode(JSON.stringify(allSkills)).length;
  const trigger = triggerScore(triggerPrompt, normalized);
  return (
    <div className="skill-status-panel">
      <div className="skill-meta-row">
        <span>
          {t.options.updatedAt}: {formatDate(normalized.updatedAt)}
        </span>
        <span>
          {t.options.skillSize}: {formatBytes(skillBytes)}
        </span>
        <span>
          {t.options.totalSkillsSize}: {formatBytes(totalBytes)}
        </span>
      </div>
      {preferences?.syncSkills && totalBytes > SYNC_MAX_BYTES_PER_ITEM && (
        <div className="skill-warning">{t.options.syncQuotaWarning}</div>
      )}
      <div className="skill-validation">
        <strong>
          {failed.length
            ? t.options.skillNeedsAttention
            : t.options.skillLooksGood}
        </strong>
        <div className="skill-checks">
          {checks.map((check) => (
            <span className={check.ok ? "ok" : "warn"} key={check.id}>
              {check.ok ? "✓" : "!"} {skillCheckLabel(t, check.id)}
            </span>
          ))}
        </div>
      </div>
      <label className="skill-switch-row">
        <span>
          <strong>{t.options.readSkillFilesVisible}</strong>
          <small>{t.options.readSkillFilesVisibleHint}</small>
        </span>
        <Switch
          checked={normalized.readSkillFiles !== false}
          onCheckedChange={(readSkillFiles) => onPatch({ readSkillFiles })}
        />
      </label>
      <div className="skill-trigger-test">
        <Input
          value={triggerPrompt}
          placeholder={t.options.triggerTestPlaceholder}
          onChange={(event) => setTriggerPrompt(event.target.value)}
        />
        {triggerPrompt && (
          <span className={trigger.score > 0 ? "ok" : "warn"}>
            {trigger.score > 0
              ? t.options.triggerTestLikely
              : t.options.triggerTestWeak}
            {trigger.matches.length ? `: ${trigger.matches.join(", ")}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export function SkillFileList({
  skill,
  onAddFile,
  onReplaceFile,
  onDeleteFile,
}: {
  skill: Skill;
  onAddFile: (file: SkillFile) => void;
  onReplaceFile: (file: SkillFile) => void;
  onDeleteFile: (path: string) => void;
}) {
  const [language] = useStoredState(storage.language);
  const [replacePath, setReplacePath] = useState("");
  const [addPath, setAddPath] = useState("references/new-file.md");
  const [previewPath, setPreviewPath] = useState("");
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const t = getMessages(language);
  const files = normalizeSkill(skill).files;
  const preview = files.find((file) => file.path === previewPath);

  async function replaceFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || !replacePath) return;
    onReplaceFile(await readReplacementSkillFile(file, replacePath));
    setReplacePath("");
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  }

  async function addUploadedFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || !addPath) return;
    onAddFile(await readReplacementSkillFile(file, addPath));
    if (addInputRef.current) addInputRef.current.value = "";
  }

  return (
    <div className="stack">
      <span className="muted">
        {t.options.skillFiles} ({files.length})
      </span>
      <div className="skill-add-file-row">
        <Input
          value={addPath}
          onChange={(event) => setAddPath(event.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddFile(createEmptySkillFile(addPath))}
        >
          <Plus size={14} /> {t.options.addFile}
        </Button>
        <input
          ref={addInputRef}
          type="file"
          hidden
          onChange={(event) => addUploadedFile(event.target.files)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => addInputRef.current?.click()}
        >
          <Upload size={14} /> {t.options.uploadFile}
        </Button>
      </div>
      <input
        ref={replaceInputRef}
        type="file"
        hidden
        onChange={(event) => replaceFile(event.target.files)}
      />
      <div className="skill-file-list">
        {files.map((file) => (
          <div className="skill-file-item" key={file.path}>
            <FileArchive size={18} />
            <span>
              <strong>{file.path}</strong>
              <small>
                {file.kind} · {file.encoding || "utf-8"} · {file.content.length}{" "}
                bytes · {formatDate(file.updatedAt)}
              </small>
            </span>
            <div className="skill-file-actions">
              <Button
                variant="ghost"
                size="icon"
                title={t.options.previewFile}
                onClick={() =>
                  setPreviewPath(previewPath === file.path ? "" : file.path)
                }
              >
                <Eye size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={t.options.replaceFile}
                onClick={() => {
                  setReplacePath(file.path);
                  window.setTimeout(() => replaceInputRef.current?.click());
                }}
              >
                <Upload size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={t.options.downloadFile}
                onClick={() => downloadSkillFile(file)}
              >
                <Download size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={t.options.deleteFile}
                disabled={file.path === SKILL_ENTRY_PATH}
                onClick={() => onDeleteFile(file.path)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {preview && (
        <pre className="skill-file-preview">
          {preview.encoding === "base64"
            ? t.options.binaryPreviewUnavailable
            : preview.content.slice(0, 8_000)}
        </pre>
      )}
    </div>
  );
}

function triggerScore(prompt: string, skill: Skill) {
  const source = `${skill.name} ${skill.description}`.toLowerCase();
  const tokens = prompt.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) || [];
  const matches = [
    ...new Set(tokens.filter((token) => source.includes(token))),
  ];
  return { score: matches.length, matches: matches.slice(0, 8) };
}

function skillCheckLabel(t: ReturnType<typeof getMessages>, id: string) {
  const labels: Record<string, string> = {
    entry: t.options.skillCheckEntry,
    name: t.options.skillCheckName,
    description: t.options.skillCheckDescription,
    "read-files": t.options.skillCheckReadFiles,
    references: t.options.skillCheckReferences,
  };
  return labels[id] || id;
}

function formatDate(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}
