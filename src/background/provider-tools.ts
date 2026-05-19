import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { isVisionImageMimeType } from "../shared/attachments";
import {
  BINARY_STRING_CHUNK_SIZE,
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_FILE_MAX_LIMIT,
} from "../shared/config";
import {
  SKILL_ENTRY_PATH,
  parseSkillFrontmatter,
  normalizeSkillName,
} from "../shared/skills";
import { storage } from "../shared/storage";
import {
  type ChatMode,
  type Preferences,
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
import { safeExecuteBrowserTool } from "./tools";
import { browserToolsForPrompt, deferredBrowserTools } from "./tool-schema";

export function toolsForMode(
  mode: ChatMode,
  hasUploadedAttachments: boolean,
  hasSkills: boolean,
  imageGenerationEnabled: boolean,
  cdpToolsEnabled: boolean,
  dangerousCodeExecutionEnabled: boolean,
  latestUserText = "",
  loadedToolNames: string[] = [],
) {
  return browserToolsForPrompt({
    mode,
    hasUploadedAttachments,
    hasSkills,
    imageGenerationEnabled,
    cdpToolsEnabled,
    dangerousCodeExecutionEnabled,
    latestUserText,
    loadedToolNames,
  });
}

export function createToolResolver({
  mode,
  uploadedAttachments,
  availableSkills,
  preferences,
  latestUserText,
}: {
  mode: ChatMode;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  preferences: Preferences;
  latestUserText: string;
}) {
  const loadedToolNames = new Set<string>();
  return {
    loadedToolNames,
    availableTools: () =>
      toolsForMode(
        mode,
        uploadedAttachments.length > 0,
        availableSkills.length > 0,
        !!preferences.imageGenerationEnabled,
        !!preferences.cdpToolsEnabled,
        !!preferences.dangerousCodeExecutionEnabled,
        latestUserText,
        [...loadedToolNames],
      ),
  };
}

export function executeContextAwareTool({
  toolName,
  input,
  context,
  uploadedAttachments,
  availableSkills,
  cdpToolsEnabled,
  dangerousCodeExecutionEnabled,
}: {
  toolName: string;
  input: Record<string, unknown>;
  context?: { chatId?: string; messageId?: string; toolCallId?: string };
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  cdpToolsEnabled: boolean;
  dangerousCodeExecutionEnabled: boolean;
}) {
  if (toolName === BROWSER_TOOL_NAME.loadBrowserTools)
    return loadBrowserTools(
      input,
      cdpToolsEnabled,
      dangerousCodeExecutionEnabled,
    );
  if (
    toolName === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript &&
    !dangerousCodeExecutionEnabled
  )
    return {
      success: false,
      error:
        "Dangerous arbitrary code execution is disabled in General settings",
    };
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
  if (toolName === BROWSER_TOOL_NAME.patchSkillFile)
    return patchSkillFile(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.generateImage)
    return generateImage(uploadedAttachments, input, context);
  if (toolName === BROWSER_TOOL_NAME.readFileFromUrl)
    return readFileFromUrl(input);
  return safeExecuteBrowserTool(toolName, input);
}

export function loadDeferredToolNames(
  output: unknown,
  loadedToolNames: Set<string>,
) {
  const names =
    output && typeof output === "object" && "loadedToolNames" in output
      ? (output as { loadedToolNames?: unknown }).loadedToolNames
      : undefined;
  if (!Array.isArray(names)) return;
  names
    .map(String)
    .filter(Boolean)
    .forEach((name) => loadedToolNames.add(name));
}

function loadBrowserTools(
  input: Record<string, unknown>,
  cdpToolsEnabled: boolean,
  dangerousCodeExecutionEnabled: boolean,
) {
  if (!cdpToolsEnabled && !dangerousCodeExecutionEnabled)
    return {
      loadedToolNames: [],
      tools: [],
      error: "Deferred CDP tools are disabled in General settings",
    };
  const requestedNames = Array.isArray(input.names)
    ? input.names
        .map(String)
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const query = String(input.query || "")
    .trim()
    .toLowerCase();
  const category = String(input.category || "")
    .trim()
    .toLowerCase();
  const matches = deferredBrowserTools
    .map((item) =>
      toolCatalogItem(item, cdpToolsEnabled, dangerousCodeExecutionEnabled),
    )
    .filter((item) => item.available)
    .filter((item) => !category || item.category === category)
    .map((item) => ({
      item,
      score: requestedNames.length
        ? requestedNames.includes(item.name)
          ? 1
          : 0
        : queryScore(item, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item)
    .slice(0, 8);
  return {
    loadedToolNames: matches.map((item) => item.name),
    tools: matches.map((item) => ({
      ...item,
      schema: deferredBrowserTools.find(
        (tool) => tool.function.name === item.name,
      )?.function,
    })),
  };
}

function queryScore(item: ReturnType<typeof toolCatalogItem>, query: string) {
  if (!query) return 1;
  const searchable = `${item.name} ${item.description} ${item.category}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  if (searchable.includes(query)) return 100;
  const terms = query
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim().toLowerCase())
    .filter(
      (term) => term.length > 2 && !DEFERRED_TOOL_QUERY_STOP_WORDS.has(term),
    );
  if (!terms.length) return 1;
  return terms.reduce(
    (score, term) => score + (searchable.includes(term) ? 1 : 0),
    0,
  );
}

function toolCatalogItem(
  item: (typeof deferredBrowserTools)[number],
  cdpToolsEnabled: boolean,
  dangerousCodeExecutionEnabled: boolean,
) {
  const name = item.function.name;
  const dangerous = name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript;
  const available = dangerous
    ? dangerousCodeExecutionEnabled
    : !name.startsWith("cdp") || cdpToolsEnabled;
  return {
    name,
    description: item.function.description,
    category: toolCategory(name),
    available,
    unavailableReason: available
      ? undefined
      : dangerous
        ? "Dangerous arbitrary code execution is disabled in General settings"
        : "CDP tools are disabled in General settings",
  };
}

function toolCategory(name: string) {
  if (name in TOOL_CATEGORY_BY_NAME)
    return TOOL_CATEGORY_BY_NAME[name as keyof typeof TOOL_CATEGORY_BY_NAME];
  if (name.startsWith("cdp")) return "cdp";
  return "common";
}

const TOOL_CATEGORY_BY_NAME = {
  [BROWSER_TOOL_NAME.readUploadedAttachment]: "files",
  [BROWSER_TOOL_NAME.readFileFromUrl]: "files",
  [BROWSER_TOOL_NAME.generateImage]: "image",
  [BROWSER_TOOL_NAME.listSkills]: "skills",
  [BROWSER_TOOL_NAME.readSkill]: "skills",
  [BROWSER_TOOL_NAME.readSkillFile]: "skills",
  [BROWSER_TOOL_NAME.updateSkillFile]: "skills",
  [BROWSER_TOOL_NAME.patchSkillFile]: "skills",
} as const;

const DEFERRED_TOOL_QUERY_STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with",
  "into",
  "from",
  "current",
  "tool",
  "tools",
]);

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
  return Math.min(READ_FILE_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BINARY_STRING_CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + BINARY_STRING_CHUNK_SIZE);
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

async function patchSkillFile(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const skillId = String(input.skillId || input.id || "");
  const path = String(input.path || "").trim();
  const reason = String(input.reason || "").trim();
  const replacements = parseSkillFileReplacements(input.replacements);
  if (!skillId || !path)
    return { error: "Missing skillId or path", skillId, path };
  if (!reason) return { error: "Missing reusable patch reason", skillId, path };
  if (!replacements.length)
    return { error: "Missing replacements", skillId, path };

  const current = availableSkills.find((skill) => skill.id === skillId);
  if (!current) return { error: "Skill not found", skillId };
  const existingFile = current.files?.find((file) => file.path === path);
  if (!existingFile) return { error: "Skill file not found", skillId, path };

  let content = existingFile.content || "";
  for (const [index, replacement] of replacements.entries()) {
    const matches = countOccurrences(content, replacement.oldText);
    if (matches !== 1)
      return {
        error:
          matches === 0
            ? "Replacement oldText not found"
            : "Replacement oldText matched more than once",
        skillId,
        path,
        replacementIndex: index,
        matches,
      };
    content = content.replace(replacement.oldText, replacement.newText);
  }

  const now = Date.now();
  const file = { ...existingFile, content, updatedAt: now };
  const nextSkill: Skill = {
    ...current,
    ...metadataPatch(path, content),
    files: current.files.map((item) => (item.path === path ? file : item)),
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
    patched: true,
    replacements: replacements.length,
    reason,
  };
}

function parseSkillFileReplacements(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const replacement = item as { oldText?: unknown; newText?: unknown };
      return {
        oldText: String(replacement.oldText ?? ""),
        newText: String(replacement.newText ?? ""),
      };
    })
    .filter((item) => item.oldText.length > 0);
}

function countOccurrences(text: string, search: string) {
  let count = 0;
  let index = 0;
  while (true) {
    const next = text.indexOf(search, index);
    if (next === -1) return count;
    count += 1;
    index = next + search.length;
  }
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
