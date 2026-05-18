import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
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
import { browserTools, safeExecuteBrowserTool } from "./tools";

export function toolsForMode(
  mode: ChatMode,
  hasUploadedAttachments: boolean,
  hasSkills: boolean,
) {
  return browserTools.filter((item) => {
    const name = item.function.name;
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return hasUploadedAttachments;
    if (name === BROWSER_TOOL_NAME.listSkills) return hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkill) return hasSkills;
    if (name === BROWSER_TOOL_NAME.readSkillFile) return hasSkills;
    if (name === BROWSER_TOOL_NAME.updateSkillFile) return hasSkills;
    return !isAskMode(mode);
  });
}

export function executeContextAwareTool({
  toolName,
  input,
  uploadedAttachments,
  availableSkills,
}: {
  toolName: string;
  input: Record<string, unknown>;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
}) {
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
  return safeExecuteBrowserTool(toolName, input);
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
