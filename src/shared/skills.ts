import {
  ISO_DATE_LENGTH,
  SKILL_MAX_CHARS,
  SKILL_NAME_MAX_LENGTH,
} from "./config";
import { finiteNumber, stringOf } from "./values";
import { readId, readPath } from "./read-ids";
import type { PickedSkill, Skill, SkillFile, SkillFileKind } from "./types";

export const SKILL_ENTRY_PATH = "SKILL.md";

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

export function getSkillEntryFile(skill: Skill) {
  return skill.files?.find((file) => file.path === SKILL_ENTRY_PATH);
}

export function getSkillInstruction(skill: Skill) {
  return getSkillEntryFile(skill)?.content || "";
}

export function getSkillBody(skill: Skill) {
  return stripSkillFrontmatter(getSkillInstruction(skill));
}

export function toPickedSkill(skill: PickedSkill): PickedSkill {
  return { id: skill.id, name: skill.name, description: skill.description };
}

// The skills the user picked for a message.
export function pickedSkillsFromMetadata(
  metadata: Record<string, unknown> | undefined,
): PickedSkill[] {
  if (!Array.isArray(metadata?.skills)) return [];
  return (metadata.skills as Partial<PickedSkill>[])
    .filter((skill) => typeof skill?.name === "string" && !!skill.name)
    .map((skill) =>
      toPickedSkill({
        id: stringOf(skill.id),
        name: stringOf(skill.name),
        description: stringOf(skill.description),
      }),
    );
}

// Variables skills and messages may use, filled in when they are sent.
export function interpolateSkillVariables(value: string, now = new Date()) {
  const date = now.toISOString().slice(0, ISO_DATE_LENGTH);
  return value.replaceAll("{{ date }}", date);
}

// Stored skills are the user's own: built-ins come from the code, so stored
// built-in copies are dropped.
export function normalizeSkills(value: unknown): Skill[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((skill, index) =>
    (skill as Partial<Skill> | null)?.builtin
      ? []
      : [normalizeSkill(skill, index)],
  );
}

// `index`: its place in the stored list, which names it when it has no id;
// without one, a skill with no id gets a new one.
export function normalizeSkill(
  skill: Partial<Skill> | null | undefined,
  index?: number,
): Skill {
  const source = skill || {};
  const id =
    index === undefined
      ? stringOf(source.id) || crypto.randomUUID()
      : readId(skill, index);
  const name = normalizeSkillName(stringOf(source.name)) || "skill";
  const description = stringOf(source.description).trim();
  const files = Array.isArray(source.files)
    ? source.files.map(normalizeSkillFile).filter(isSkillFile)
    : [];
  const createdAt = finiteNumber(source.createdAt, 0);
  const updatedAt = finiteNumber(source.updatedAt, 0);

  if (files.length)
    return {
      id,
      name,
      description,
      files,
      ...(source.builtin === true ? { builtin: true } : {}),
      createdAt,
      updatedAt,
    };

  return createSkillPackage({
    id,
    name,
    description,
    createdAt,
    updatedAt,
  });
}

function normalizeSkillFile(file: Partial<SkillFile>): SkillFile | undefined {
  const path = readPath(file?.path);
  const content = stringOf(file?.content);
  if (!path) return undefined;
  return {
    path,
    kind: skillFileKind(path),
    content,
    updatedAt: finiteNumber(file?.updatedAt, 0),
  };
}

function isSkillFile(file: SkillFile | undefined): file is SkillFile {
  return !!file;
}

export function duplicateSkill(skill: Skill, existingNames: string[]): Skill {
  const normalized = normalizeSkill(skill);
  const name = uniqueSkillName(`${normalized.name}-copy`, existingNames);
  return copySkill(normalized, name);
}

// A user copy of a skill under `name`; a copy with a built-in's name
// overrides that built-in.
export function copySkill(skill: Skill, name = skill.name): Skill {
  const normalized = normalizeSkill(skill);
  const { builtin: _builtin, ...rest } = normalized;
  return {
    ...rest,
    id: crypto.randomUUID(),
    name,
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

// Characters of a skill's files together (capped at SKILL_MAX_CHARS).
export const skillChars = (skill: Skill) =>
  skill.files.reduce((total, file) => total + file.content.length, 0);

export const skillTooLarge = (skill: Skill) =>
  skillChars(skill) > SKILL_MAX_CHARS;

export function validateSkill(skill: Skill) {
  const normalized = normalizeSkill(skill);
  const entry = getSkillEntryFile(normalized);
  const metadata = entry ? parseSkillFrontmatter(entry.content) : undefined;
  return [
    { id: "entry", ok: !!entry },
    {
      id: "name",
      ok:
        !!metadata?.name && normalizeSkillName(metadata.name) === metadata.name,
    },
    {
      id: "description",
      ok: !!metadata?.description || !!normalized.description,
    },
    { id: "size", ok: !skillTooLarge(normalized) },
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

export function skillFileKind(path: string): SkillFileKind {
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
