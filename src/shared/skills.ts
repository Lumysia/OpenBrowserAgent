import { SKILL_NAME_MAX_LENGTH } from "./config";
import type { Skill, SkillFile } from "./types";

export const SKILL_ENTRY_PATH = "SKILL.md";

type LegacySkill = Partial<Skill> & {
  title?: string;
  instruction?: string;
};

export function createSkillPackage({
  id = crypto.randomUUID(),
  name,
  description = "",
  instruction = "",
  createdAt = Date.now(),
  updatedAt = Date.now(),
}: {
  id?: string;
  name: string;
  description?: string;
  instruction?: string;
  createdAt?: number;
  updatedAt?: number;
}): Skill {
  const skillName = normalizeSkillName(name) || "skill";
  return {
    id,
    name: skillName,
    description: description.trim(),
    files: [createSkillFile(skillName, description, instruction, updatedAt)],
    enabled: true,
    createdAt,
    updatedAt,
  };
}

export function createSkillPackageFromFiles({
  name,
  description,
  files,
}: {
  name: string;
  description: string;
  files: SkillFile[];
}): Skill {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: normalizeSkillName(name) || "skill",
    description: description.trim(),
    files,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSkillFile(
  name: string,
  description: string,
  body: string,
  updatedAt = Date.now(),
): SkillFile {
  return {
    path: SKILL_ENTRY_PATH,
    kind: "markdown",
    content: renderSkillMarkdown(name, description, body),
    updatedAt,
  };
}

export function replaceSkillEntryFile(
  skill: Skill,
  name: string,
  description: string,
  body: string,
) {
  const entry = createSkillFile(name, description, body);
  const files =
    skill.files?.filter((file) => file.path !== SKILL_ENTRY_PATH) || [];
  return [entry, ...files];
}

export function getSkillDisplayName(skill: Skill, fallback = "Skill") {
  const legacy = skill as LegacySkill;
  return legacy.name || legacy.title || fallback;
}

export function getSkillEntryFile(skill: Skill) {
  const legacy = skill as LegacySkill;
  return (
    skill.files?.find((file) => file.path === SKILL_ENTRY_PATH) ||
    (legacy.instruction
      ? createSkillFile(
          getSkillDisplayName(skill),
          legacy.description || "",
          legacy.instruction,
        )
      : undefined)
  );
}

export function getSkillInstruction(skill: Skill) {
  return getSkillEntryFile(skill)?.content || "";
}

export function getSkillBody(skill: Skill) {
  return stripSkillFrontmatter(getSkillInstruction(skill));
}

export function normalizeSkill(skill: Skill): Skill {
  const legacy = skill as LegacySkill;
  if (skill.name && skill.files?.length)
    return { ...skill, enabled: skill.enabled !== false };
  return createSkillPackage({
    id: skill.id,
    name: legacy.name || legacy.title || "skill",
    description: legacy.description || "",
    instruction: legacy.instruction || "",
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  });
}

export function isSkillEnabled(skill: Skill) {
  return normalizeSkill(skill).enabled !== false;
}

export function duplicateSkill(skill: Skill, existingNames: string[]) {
  const normalized = normalizeSkill(skill);
  const name = uniqueSkillName(`${normalized.name}-copy`, existingNames);
  return {
    ...normalized,
    id: crypto.randomUUID(),
    name,
    enabled: true,
    builtin: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: replaceSkillEntryFile(
      normalized,
      name,
      normalized.description,
      getSkillBody(normalized),
    ).map((file) => ({ ...file, updatedAt: Date.now() })),
  };
}

export function validateSkill(skill: Skill) {
  const normalized = normalizeSkill(skill);
  const entry = getSkillEntryFile(normalized);
  const metadata = entry ? parseSkillFrontmatter(entry.content) : undefined;
  return [
    { id: "entry", ok: !!entry, message: "SKILL.md exists" },
    {
      id: "name",
      ok:
        !!metadata?.name && normalizeSkillName(metadata.name) === metadata.name,
      message: "frontmatter name is kebab-case",
    },
    {
      id: "description",
      ok: !!metadata?.description || !!normalized.description,
      message: "description is present",
    },
  ];
}

export function skillPackageBytes(skill: Skill) {
  return new TextEncoder().encode(JSON.stringify(normalizeSkill(skill))).length;
}

export function normalizeSkillName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX_LENGTH);
}

function uniqueSkillName(base: string, existingNames: string[]) {
  const normalized = normalizeSkillName(base) || "skill";
  if (!existingNames.includes(normalized)) return normalized;
  for (let index = 2; ; index += 1) {
    const candidate = normalizeSkillName(`${normalized}-${index}`);
    if (!existingNames.includes(candidate)) return candidate;
  }
}

export function parseSkillFrontmatter(value: string) {
  const match = value.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { name: "", description: "" };
  const frontmatter = match[1];
  return {
    name: readFrontmatterValue(frontmatter, "name"),
    description: readFrontmatterValue(frontmatter, "description"),
  };
}

export function skillFileKind(path: string) {
  if (path.startsWith("assets/")) return "asset";
  if (path.startsWith("scripts/")) return "script";
  if (path.endsWith(".md") || path === SKILL_ENTRY_PATH) return "markdown";
  return "text";
}

function renderSkillMarkdown(name: string, description: string, body: string) {
  return `---\nname: ${yamlScalar(normalizeSkillName(name) || "skill")}\ndescription: ${yamlScalar(description.trim())}\n---\n\n${body.trim()}\n`;
}

function stripSkillFrontmatter(value: string) {
  return value.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function yamlScalar(value: string) {
  return JSON.stringify(value);
}

function readFrontmatterValue(frontmatter: string, key: string) {
  const line = frontmatter
    .split("\n")
    .find((item) => item.trimStart().startsWith(`${key}:`));
  if (!line) return "";
  const raw = line.slice(line.indexOf(":") + 1).trim();
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed.trim() : String(parsed).trim();
  } catch {
    return raw.replace(/^['"]|['"]$/g, "").trim();
  }
}
