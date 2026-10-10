import { storage } from "../shared/storage";
import {
  SKILL_ENTRY_PATH,
  createSkillPackage,
  normalizeSkillName,
  parseSkillFrontmatter,
  skillFileKind,
} from "../shared/skills";
import type { Skill } from "../shared/types";
import { listSkills, readSkill, readSkillFile } from "./attachment-messages";

export function manageSkills(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const operation = String(input.operation || "list");
  if (operation === "list") return listSkills(availableSkills, input);
  if (operation === "create") return createSkill(availableSkills, input);
  if (operation === "read") return readSkill(availableSkills, input);
  if (operation === "readFile") return readSkillFile(availableSkills, input);
  if (operation === "updateFile" || operation === "patchFile")
    return editSkillFile(availableSkills, input, operation === "patchFile");
  return { error: "Unknown skill operation", operation };
}

async function createSkill(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const name = normalizeSkillName(String(input.name || ""));
  const description = String(input.description || "").trim();
  const instruction = String(input.instruction || input.content || "").trim();
  const reason = String(input.reason || "").trim();
  if (!name) return { error: "Missing skill name" };
  if (!instruction)
    return { error: "Missing reusable skill instruction", name };
  if (!reason) return { error: "Missing reusable creation reason", name };
  const allSkills = await storage.skills.get();
  const existing = allSkills.find(
    (skill) => normalizeSkillName(skill.name || "") === name,
  );
  if (existing)
    return {
      error: "Skill already exists",
      skillId: existing.id,
      name: existing.name,
      nextAction: "Use updateFile or patchFile for this existing skill.",
    };
  const skill = createSkillPackage({ name, description, instruction });
  await storage.skills.set([...allSkills, skill]);
  availableSkills.push(skill);
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    created: true,
    reason,
    files: skill.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      size: file.content.length,
    })),
  };
}

async function editSkillFile(
  availableSkills: Skill[],
  input: Record<string, unknown>,
  patch: boolean,
) {
  const skillId = String(input.skillId || input.id || "");
  const path = String(input.path || "").trim();
  const reason = String(input.reason || "").trim();
  if (!skillId || !path)
    return { error: "Missing skillId or path", skillId, path };
  if (!reason)
    return {
      error: `Missing reusable ${patch ? "patch" : "update"} reason`,
      skillId,
      path,
    };
  if (!availableSkills.some((skill) => skill.id === skillId))
    return { error: "Skill not found", skillId };
  // Work from the latest persisted package so unrelated file edits made since
  // this run started survive. The run's list only controls availability.
  const allSkills = await storage.skills.get();
  const current = allSkills.find((skill) => skill.id === skillId);
  if (!current) return { error: "Skill not found", skillId };
  const existingFile = current.files.find((file) => file.path === path);
  let content = String(input.content ?? "");
  let replacements = 0;
  if (patch) {
    if (!existingFile) return { error: "Skill file not found", skillId, path };
    const edits = parseReplacements(input.replacements);
    if (!edits?.length)
      return { error: "Invalid or missing replacements", skillId, path };
    content = existingFile.content;
    for (const [index, edit] of edits.entries()) {
      const matches = content.split(edit.oldText).length - 1;
      if (matches !== 1)
        return {
          error: matches
            ? "Replacement oldText matched more than once"
            : "Replacement oldText not found",
          skillId,
          path,
          replacementIndex: index,
          matches,
        };
      content = content.replace(edit.oldText, () => edit.newText);
    }
    replacements = edits.length;
  }
  const now = Date.now();
  const file = {
    path,
    kind: existingFile?.kind || skillFileKind(path),
    encoding: patch ? existingFile!.encoding : ("utf-8" as const),
    content,
    updatedAt: now,
  };
  const metadata = parseSkillFrontmatter(
    path === SKILL_ENTRY_PATH ? content : "",
  );
  const next: Skill = {
    ...current,
    ...(metadata.name ? { name: normalizeSkillName(metadata.name) } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    files: existingFile
      ? current.files.map((item) => (item.path === path ? file : item))
      : [...current.files, file],
    updatedAt: now,
  };
  await storage.skills.set(
    allSkills.map((skill) => (skill.id === skillId ? next : skill)),
  );
  availableSkills[availableSkills.findIndex((skill) => skill.id === skillId)] =
    next;
  return {
    id: next.id,
    name: next.name,
    path,
    reason,
    ...(patch ? { patched: true, replacements } : { updated: true }),
  };
}

function parseReplacements(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const edits: Array<{ oldText: string; newText: string }> = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.oldText !== "string" ||
      !item.oldText ||
      typeof item.newText !== "string"
    )
      return undefined;
    edits.push({ oldText: item.oldText, newText: item.newText });
  }
  return edits;
}
