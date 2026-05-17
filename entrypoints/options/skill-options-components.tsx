import { useRef, useState } from "react";
import {
  Check,
  Download,
  FileArchive,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { COPY_FEEDBACK_MS, ISO_DATE_LENGTH } from "../../src/shared/config";
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
import { Button, Input, Textarea } from "../../src/ui/components";
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

export function SkillStatusPanel({ skill }: { skill: Skill }) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  const normalized = normalizeSkill(skill);
  const checks = validateSkill(normalized);
  const failed = checks.filter((check) => !check.ok);
  const skillBytes = skillPackageBytes(normalized);
  return (
    <div className="skill-status-panel">
      <div className="skill-meta-row">
        <span>
          {t.options.updatedAt}: {formatDate(normalized.updatedAt)}
        </span>
        <span>
          {t.options.skillSize}: {formatBytes(skillBytes)}
        </span>
      </div>
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
  onReplaceFile: (file: SkillFile, previousPath?: string) => void;
  onDeleteFile: (path: string) => void;
}) {
  const [language] = useStoredState(storage.language);
  const [replacePath, setReplacePath] = useState("");
  const [addPath, setAddPath] = useState("references/new-file.md");
  const [editPath, setEditPath] = useState("");
  const [editFilePath, setEditFilePath] = useState("");
  const [editContent, setEditContent] = useState("");
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const t = getMessages(language);
  const files = normalizeSkill(skill).files;
  const editingFile = files.find((file) => file.path === editPath);

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

  function startEdit(file: SkillFile) {
    if (file.encoding === "base64") return;
    setEditPath(editPath === file.path ? "" : file.path);
    setEditFilePath(file.path);
    setEditContent(file.content);
  }

  function saveEditedFile() {
    if (!editingFile) return;
    const nextPath =
      editingFile.path === SKILL_ENTRY_PATH
        ? SKILL_ENTRY_PATH
        : editFilePath.trim();
    if (
      !nextPath ||
      (nextPath === SKILL_ENTRY_PATH && editingFile.path !== SKILL_ENTRY_PATH)
    )
      return;
    onReplaceFile(
      {
        ...editingFile,
        path: nextPath,
        content: editContent,
        updatedAt: Date.now(),
      },
      editingFile.path,
    );
    setEditPath("");
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
        {files.map((file) => {
          const isEditing = editingFile?.path === file.path;
          return (
            <div className="skill-file-block" key={file.path}>
              <div className="skill-file-item">
                <FileArchive size={18} />
                <span>
                  <strong>{file.path}</strong>
                  <small>
                    {file.kind} · {file.encoding || "utf-8"} ·{" "}
                    {file.content.length} bytes · {formatDate(file.updatedAt)}
                  </small>
                </span>
                <div className="skill-file-actions">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t.options.editFile}
                    disabled={file.encoding === "base64"}
                    onClick={() => startEdit(file)}
                  >
                    <Pencil size={14} />
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
              {isEditing && editingFile.encoding !== "base64" && (
                <div className="skill-file-editor stack">
                  <Input
                    value={editFilePath}
                    disabled={editingFile.path === SKILL_ENTRY_PATH}
                    placeholder={t.options.filePath}
                    aria-label={t.options.filePath}
                    onChange={(event) => setEditFilePath(event.target.value)}
                  />
                  <Textarea
                    className="skill-file-editor-textarea"
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                  />
                  <div className="row">
                    <Button size="sm" onClick={saveEditedFile}>
                      <Check size={14} /> {t.options.saveFile}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function skillCheckLabel(t: ReturnType<typeof getMessages>, id: string) {
  const labels: Record<string, string> = {
    entry: t.options.skillCheckEntry,
    name: t.options.skillCheckName,
    description: t.options.skillCheckDescription,
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

export function formatSkillBytes(value: number) {
  return formatBytes(value);
}
