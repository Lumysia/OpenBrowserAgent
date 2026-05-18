import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { isVisionImageMimeType } from "../shared/attachments";
import { READ_ATTACHMENT_DEFAULT_LIMIT } from "../shared/config";
import {
  SKILL_ENTRY_PATH,
  parseSkillFrontmatter,
  normalizeSkillName,
} from "../shared/skills";
import { storage } from "../shared/storage";
import {
  isAskMode,
  type ChatMode,
  type Skill,
  type SkillFileKind,
  type UploadedAttachment,
} from "../shared/types";
import {
  listSkills,
  readSkill,
  readSkillFile,
  readUploadedAttachment,
} from "./attachment-messages";
import { generateImage } from "./image-generation";
import { allBrowserTools, browserTools, safeExecuteBrowserTool } from "./tools";

export function toolsForMode(
  mode: ChatMode,
  hasUploadedAttachments: boolean,
  hasSkills: boolean,
  imageGenerationEnabled: boolean,
  cdpToolsEnabled: boolean,
) {
  return browserTools.filter((item) => {
    const name = item.function.name;
    if (name === BROWSER_TOOL_NAME.listBrowserTools) return !isAskMode(mode);
    if (name === BROWSER_TOOL_NAME.readBrowserTool) return !isAskMode(mode);
    if (name === BROWSER_TOOL_NAME.runBrowserTool) return !isAskMode(mode);
    if (name.startsWith("cdp") && !cdpToolsEnabled) return false;
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return hasUploadedAttachments;
    if (name === BROWSER_TOOL_NAME.listSkills) return hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkill) return hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkillFile) return hasSkills;
    if (name === BROWSER_TOOL_NAME.updateSkillFile) return hasSkills;
    if (name === BROWSER_TOOL_NAME.generateImage) return imageGenerationEnabled;
    if (name === BROWSER_TOOL_NAME.readFileFromUrl) return true;
    return !isAskMode(mode);
  });
}

export function executeContextAwareTool({
  toolName,
  input,
  uploadedAttachments,
  availableSkills,
  cdpToolsEnabled,
}: {
  toolName: string;
  input: Record<string, unknown>;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  cdpToolsEnabled: boolean;
}) {
  if (toolName === BROWSER_TOOL_NAME.listBrowserTools)
    return listBrowserTools(input, cdpToolsEnabled);
  if (toolName === BROWSER_TOOL_NAME.readBrowserTool)
    return readBrowserTool(input, cdpToolsEnabled);
  if (toolName === BROWSER_TOOL_NAME.runBrowserTool)
    return runBrowserTool(input, cdpToolsEnabled);
  if (toolName === BROWSER_TOOL_NAME.readUploadedAttachment)
    return readUploadedAttachment(uploadedAttachments, input);
  if (toolName === BROWSER_TOOL_NAME.listSkills)
    return listSkills(availableSkills);
  if (toolName === BROWSER_TOOL_NAME.readSkill)
    return readSkill(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.readSkillFile)
    return readSkillFile(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.updateSkillFile)
    return updateSkillFile(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.generateImage)
    return generateImage(uploadedAttachments, input);
  if (toolName === BROWSER_TOOL_NAME.readFileFromUrl)
    return readFileFromUrl(input);
  return safeExecuteBrowserTool(toolName, input);
}

function listBrowserTools(
  input: Record<string, unknown>,
  cdpToolsEnabled: boolean,
) {
  const category = String(input.category || "")
    .trim()
    .toLowerCase();
  return {
    cdpToolsEnabled,
    tools: allBrowserTools
      .map((item) => toolCatalogItem(item, cdpToolsEnabled))
      .filter((item) => !category || item.category === category),
  };
}

function readBrowserTool(
  input: Record<string, unknown>,
  cdpToolsEnabled: boolean,
) {
  const name = String(input.name || "").trim();
  const tool = allBrowserTools.find((item) => item.function.name === name);
  if (!tool) return { error: `Unknown browser tool: ${name}` };
  return { ...toolCatalogItem(tool, cdpToolsEnabled), schema: tool.function };
}

function runBrowserTool(
  input: Record<string, unknown>,
  cdpToolsEnabled: boolean,
) {
  const name = String(input.name || "").trim();
  const args =
    input.arguments && typeof input.arguments === "object"
      ? (input.arguments as Record<string, unknown>)
      : {};
  const tool = allBrowserTools.find((item) => item.function.name === name);
  if (!tool) return { error: `Unknown browser tool: ${name}` };
  if (name.startsWith("cdp") && !cdpToolsEnabled)
    return { error: "CDP tools are disabled in General settings", name };
  if (
    name === BROWSER_TOOL_NAME.listBrowserTools ||
    name === BROWSER_TOOL_NAME.readBrowserTool ||
    name === BROWSER_TOOL_NAME.runBrowserTool
  )
    return {
      error: "Catalog tools cannot be nested through runBrowserTool",
      name,
    };
  return safeExecuteBrowserTool(name, args);
}

function toolCatalogItem(
  item: (typeof allBrowserTools)[number],
  cdpToolsEnabled: boolean,
) {
  const name = item.function.name;
  return {
    name,
    description: item.function.description,
    category: toolCategory(name),
    available: !name.startsWith("cdp") || cdpToolsEnabled,
    unavailableReason:
      name.startsWith("cdp") && !cdpToolsEnabled
        ? "CDP tools are disabled in General settings"
        : undefined,
  };
}

function toolCategory(name: string) {
  const lower = name.toLowerCase();
  if (lower.startsWith("cdp")) return "cdp";
  if (lower.includes("skill")) return "skills";
  if (lower.includes("image")) return "image";
  if (lower.includes("file") || lower.includes("attachment")) return "files";
  return "common";
}

async function readFileFromUrl(input: Record<string, unknown>) {
  const url = String(input.url || "").trim();
  if (!url) return { error: "Missing file URL" };
  try {
    const { blob, type, size } = await fetchFileBlob(url);
    const format = String(input.format || "auto");
    const offset = clampOffset(input.offset);
    const limit = clampLimit(input.limit);
    if (format === "text" || (format === "auto" && isTextType(type, url))) {
      const text = await blob.text();
      return sliceOutput(
        { url, type, size, encoding: "text" },
        text,
        offset,
        limit,
        "text",
      );
    }
    if (isVisionImageMimeType(type) && format === "auto") {
      const dataUrl = await blobToDataUrl(blob);
      return imageToolOutput(dataUrl, type, size, url);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (format === "hex")
      return sliceOutput(
        binaryMetadata(url, type, size, "hex"),
        bytesToHex(bytes),
        offset,
        limit,
        "hex",
      );
    return sliceOutput(
      binaryMetadata(url, type, size, "base64"),
      bytesToBase64(bytes),
      offset,
      limit,
      "base64",
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

async function fetchFileBlob(url: string) {
  if (url.startsWith("data:")) return dataUrlBlob(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  const blob = await response.blob();
  return {
    blob,
    type: blob.type || "application/octet-stream",
    size: blob.size,
  };
}

function dataUrlBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid data URL");
  const type = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const body = decodeURIComponent(match[3] || "");
  const binary = isBase64 ? atob(body) : body;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type });
  return { blob, type, size: blob.size };
}

function imageToolOutput(
  dataUrl: string,
  type: string,
  size: number,
  url?: string,
) {
  return {
    success: true,
    url,
    type,
    size,
    _visionImage: { dataUrl, type, url, size },
    note: "Image pixels will be sent to the next model call as a vision image.",
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function isTextType(type: string, url: string) {
  return (
    type.startsWith("text/") ||
    /\b(json|xml|yaml|csv|markdown|javascript|svg\+xml)\b/i.test(type) ||
    /\.(txt|md|markdown|json|jsonl|csv|tsv|xml|ya?ml|html?|css|js|svg)(\?|#|$)/i.test(
      url,
    )
  );
}

function binaryMetadata(
  url: string,
  type: string,
  size: number,
  encoding: string,
) {
  return {
    url,
    type,
    size,
    encoding,
    note: "Binary file content is provided as a slice. If this is PDF, Office, audio, or video, semantic understanding may require a provider-specific file parser/transcription tool.",
  };
}

function sliceOutput(
  metadata: Record<string, unknown>,
  content: string,
  offset: number,
  limit: number,
  field: string,
) {
  return {
    success: true,
    ...metadata,
    offset,
    limit,
    totalLength: content.length,
    truncated: offset + limit < content.length,
    [field]: content.slice(offset, offset + limit),
  };
}

function clampOffset(value: unknown) {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

function clampLimit(value: unknown) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return READ_ATTACHMENT_DEFAULT_LIMIT;
  return Math.min(60000, Math.max(1, Math.trunc(limit)));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function updateSkillFile(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const skillId = String(input.skillId || input.id || "");
  const path = String(input.path || "").trim();
  const content = String(input.content ?? "");
  const reason = String(input.reason || "").trim();
  if (!skillId || !path)
    return { error: "Missing skillId or path", skillId, path };
  if (!reason)
    return { error: "Missing reusable update reason", skillId, path };
  const current = availableSkills.find((skill) => skill.id === skillId);
  if (!current) return { error: "Skill not found", skillId };

  const now = Date.now();
  const existingFile = current.files?.find((file) => file.path === path);
  const file = {
    path,
    kind: existingFile?.kind || inferSkillFileKind(path),
    encoding: "utf-8" as const,
    content,
    updatedAt: now,
  };
  const nextSkill: Skill = {
    ...current,
    ...metadataPatch(path, content),
    files: existingFile
      ? current.files.map((item) => (item.path === path ? file : item))
      : [...(current.files || []), file],
    updatedAt: now,
  };

  const allSkills = (await storage.skills.get()) || [];
  await storage.skills.set(
    allSkills.map((skill) => (skill.id === skillId ? nextSkill : skill)),
  );
  const availableIndex = availableSkills.findIndex(
    (skill) => skill.id === skillId,
  );
  if (availableIndex >= 0) availableSkills[availableIndex] = nextSkill;
  return {
    id: nextSkill.id,
    name: nextSkill.name,
    path,
    updated: true,
    reason,
  };
}

function metadataPatch(path: string, content: string) {
  if (path !== SKILL_ENTRY_PATH) return {};
  const metadata = parseSkillFrontmatter(content);
  return {
    ...(metadata.name ? { name: normalizeSkillName(metadata.name) } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
  };
}

function inferSkillFileKind(path: string): SkillFileKind {
  if (path === SKILL_ENTRY_PATH || path.endsWith(".md")) return "markdown";
  if (path.startsWith("scripts/")) return "script";
  if (path.startsWith("assets/")) return "asset";
  return "text";
}
