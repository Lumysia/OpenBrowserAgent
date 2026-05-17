import JSZip from "jszip";
import {
  createSkillPackageFromFiles,
  normalizeSkillName,
  parseSkillFrontmatter,
  SKILL_ENTRY_PATH,
  skillFileKind,
} from "../../src/shared/skills";
import type { Skill, SkillFile } from "../../src/shared/types";

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".js",
  ".ts",
  ".css",
  ".html",
  ".xml",
]);

export async function importSkillZip(file: File): Promise<Skill> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && !isHiddenPath(entry.name),
  );
  const root = commonSkillRoot(
    entries.map((entry) => normalizePath(entry.name)),
  );
  const files = await Promise.all(
    entries.map(async (entry) => readZipFile(entry, root)),
  );
  const entryFile = files.find((item) => item.path === SKILL_ENTRY_PATH);
  if (!entryFile) throw new Error("SKILL.md not found in the ZIP package.");
  const frontmatter = parseSkillFrontmatter(entryFile.content);
  const fallbackName = normalizeSkillName(
    file.name.replace(/\.(zip|skill)$/i, ""),
  );
  return createSkillPackageFromFiles({
    name: frontmatter.name || fallbackName || "skill",
    description: frontmatter.description,
    files: sortSkillFiles(files),
  });
}

export async function readReplacementSkillFile(
  file: File,
  path: string,
): Promise<SkillFile> {
  const isText = isTextPath(path);
  return {
    path,
    kind: skillFileKind(path),
    encoding: isText ? "utf-8" : "base64",
    content: isText
      ? await file.text()
      : bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    updatedAt: Date.now(),
  };
}

export function downloadSkillFile(file: SkillFile) {
  const blob = new Blob(
    [file.encoding === "base64" ? base64ToBytes(file.content) : file.content],
    {
      type:
        file.encoding === "base64"
          ? "application/octet-stream"
          : "text/plain;charset=utf-8",
    },
  );
  downloadBlob(blob, file.path.split("/").pop() || file.path);
}

export async function downloadSkillZip(skill: Skill, extension = "zip") {
  const zip = new JSZip();
  const root = normalizeSkillName(skill.name || "skill") || "skill";
  for (const file of skill.files || [])
    zip.file(
      `${root}/${file.path}`,
      file.encoding === "base64" ? base64ToBytes(file.content) : file.content,
      { binary: file.encoding === "base64" },
    );
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${root}.${extension}`);
}

export function createEmptySkillFile(path: string): SkillFile {
  return {
    path: normalizePath(path),
    kind: skillFileKind(path),
    encoding: "utf-8",
    content: "",
    updatedAt: Date.now(),
  };
}

async function readZipFile(
  entry: JSZip.JSZipObject,
  root: string,
): Promise<SkillFile> {
  const path = stripRoot(normalizePath(entry.name), root);
  const isText = isTextPath(path);
  return {
    path,
    kind: skillFileKind(path),
    encoding: isText ? "utf-8" : "base64",
    content: isText
      ? await entry.async("string")
      : bytesToBase64(await entry.async("uint8array")),
    updatedAt: Date.now(),
  };
}

function commonSkillRoot(paths: string[]) {
  const roots = new Set(paths.map((path) => path.split("/")[0] || ""));
  if (roots.size !== 1) return "";
  const root = [...roots][0];
  return paths.includes(`${root}/${SKILL_ENTRY_PATH}`) ? root : "";
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function stripRoot(path: string, root: string) {
  return root && path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path;
}

function isHiddenPath(path: string) {
  return normalizePath(path)
    .split("/")
    .some((segment) => segment.startsWith(".") || segment === "__MACOSX");
}

function isTextPath(path: string) {
  if (path === SKILL_ENTRY_PATH) return true;
  const extension = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return !extension || TEXT_FILE_EXTENSIONS.has(extension);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sortSkillFiles(files: SkillFile[]) {
  return [...files].sort((left, right) => {
    if (left.path === SKILL_ENTRY_PATH) return -1;
    if (right.path === SKILL_ENTRY_PATH) return 1;
    return left.path.localeCompare(right.path);
  });
}
