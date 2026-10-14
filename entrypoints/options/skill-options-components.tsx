import { useRef, useState, type ReactNode } from "react";
import {
  Check,
  Download,
  Eye,
  FileArchive,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { formatBytes, formatDateTime } from "../../src/shared/format";
import { getMessages } from "../../src/shared/i18n";
import { normalizeSkill, SKILL_ENTRY_PATH } from "../../src/shared/skills";
import { storage } from "../../src/shared/storage";
import type { Skill, SkillFile } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type ButtonProps,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import {
  createEmptySkillFile,
  downloadSkillFile,
  readReplacementSkillFile,
} from "./skill-import";

// Without edit handlers the files are read-only (built-in skills).
export function SkillFileList({
  skill,
  onAddFile,
  onReplaceFile,
  onDeleteFile,
}: {
  skill: Skill;
  onAddFile?: (file: SkillFile) => void;
  onReplaceFile?: (file: SkillFile, previousPath?: string) => void;
  onDeleteFile?: (path: string) => void;
}) {
  const readOnly = !onAddFile || !onReplaceFile || !onDeleteFile;
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
    onReplaceFile?.(await readReplacementSkillFile(file, replacePath));
    setReplacePath("");
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  }

  async function addUploadedFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || !addPath) return;
    onAddFile?.(await readReplacementSkillFile(file, addPath));
    if (addInputRef.current) addInputRef.current.value = "";
  }

  function startEdit(file: SkillFile) {
    if (file.encoding === "base64") return;
    setEditPath(editPath === file.path ? "" : file.path);
    setEditFilePath(file.path);
    setEditContent(file.content);
  }

  function saveEditedFile() {
    if (!editingFile || !onReplaceFile) return;
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
    <Accordion type="single" collapsible className="stack">
      <AccordionItem value="files" className="option-file-section">
        <AccordionTrigger>
          <span className="skill-trigger-label">
            <FileArchive size={18} />
            {t.options.skillFiles} ({files.length})
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="stack">
            {!readOnly && (
              <div className="option-add-file-row">
                <Input
                  value={addPath}
                  onChange={(event) => setAddPath(event.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddFile?.(createEmptySkillFile(addPath))}
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
            )}
            <input
              ref={replaceInputRef}
              type="file"
              hidden
              onChange={(event) => replaceFile(event.target.files)}
            />
            <div className="option-file-list">
              {files.map((file) => {
                const isEditing = editingFile?.path === file.path;
                return (
                  <div className="option-file-block" key={file.path}>
                    <div className="option-file-item">
                      <FileArchive size={18} />
                      <span>
                        <span className="option-file-name ui-selectable">
                          {file.path}
                        </span>
                        <small>
                          {file.kind} · {file.encoding || "utf-8"} ·{" "}
                          {formatBytes(file.content.length, "kb")} ·{" "}
                          {formatDate(file.updatedAt)}
                        </small>
                      </span>
                      <div className="option-file-actions">
                        <SkillFileActionButton
                          label={
                            readOnly ? t.options.viewFile : t.options.editFile
                          }
                          disabled={file.encoding === "base64"}
                          onClick={() => startEdit(file)}
                        >
                          {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                        </SkillFileActionButton>
                        {!readOnly && (
                          <SkillFileActionButton
                            label={t.options.replaceFile}
                            onClick={() => {
                              setReplacePath(file.path);
                              window.setTimeout(() =>
                                replaceInputRef.current?.click(),
                              );
                            }}
                          >
                            <Upload size={14} />
                          </SkillFileActionButton>
                        )}
                        <SkillFileActionButton
                          label={t.options.downloadFile}
                          onClick={() => downloadSkillFile(file)}
                        >
                          <Download size={14} />
                        </SkillFileActionButton>
                        {!readOnly && (
                          <SkillFileActionButton
                            label={t.options.deleteFile}
                            disabled={file.path === SKILL_ENTRY_PATH}
                            onClick={() => onDeleteFile?.(file.path)}
                          >
                            <Trash2 size={14} />
                          </SkillFileActionButton>
                        )}
                      </div>
                    </div>
                    {isEditing && editingFile.encoding !== "base64" && (
                      <div className="option-file-editor stack">
                        <Input
                          value={editFilePath}
                          disabled={
                            readOnly || editingFile.path === SKILL_ENTRY_PATH
                          }
                          placeholder={t.options.filePath}
                          aria-label={t.options.filePath}
                          onChange={(event) =>
                            setEditFilePath(event.target.value)
                          }
                        />
                        <Textarea
                          className="option-file-editor-textarea"
                          value={editContent}
                          readOnly={readOnly}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                        />
                        {!readOnly && (
                          <div className="row">
                            <Button size="sm" onClick={saveEditedFile}>
                              <Check size={14} /> {t.options.saveFile}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function SkillFileActionButton({
  label,
  children,
  ...props
}: ButtonProps & { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="tooltip-button-wrapper">
          <Button variant="ghost" size="icon" aria-label={label} {...props}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function formatDate(value?: number) {
  return value ? formatDateTime(value) : "-";
}
