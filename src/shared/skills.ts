import {
  ISO_DATE_LENGTH,
  SKILL_MAX_CHARS,
  SKILL_NAME_MAX_LENGTH,
} from "./config";
import { finiteNumber, stringOf } from "./values";
import { readId, readPath } from "./read-ids";
import type {
  PickedSkill,
  Skill,
  SkillFile,
  SkillFileKind,
  SkillMetadata,
} from "./types";

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
  metadata: SkillMetadata = {},
): SkillFile {
  return {
    path: SKILL_ENTRY_PATH,
    kind: "markdown",
    content: renderSkillMarkdown(name, description, body, metadata),
    updatedAt,
  };
}

// A new SKILL.md with this name, description and body; its frontmatter
// `metadata` stays unless `metadata` replaces it.
export function replaceSkillEntryFile(
  skill: Skill,
  name: string,
  description: string,
  body: string,
  metadata = getSkillMetadata(skill),
) {
  const entry = createSkillFile(name, description, body, Date.now(), metadata);
  const files =
    skill.files?.filter((file) => file.path !== SKILL_ENTRY_PATH) || [];
  return [entry, ...files];
}

function getSkillEntryFile(skill: Skill) {
  return skill.files?.find((file) => file.path === SKILL_ENTRY_PATH);
}

export function getSkillInstruction(skill: Skill) {
  return getSkillEntryFile(skill)?.content || "";
}

export function getSkillBody(skill: Skill) {
  return stripSkillFrontmatter(getSkillInstruction(skill));
}

export function getSkillMetadata(skill: Skill): SkillMetadata {
  return parseSkillMetadata(getSkillInstruction(skill));
}

// The skill with its SKILL.md frontmatter `metadata` changed by `patch`
// (an empty value removes a key); name, description and body stay.
export function withSkillMetadata(
  skill: Skill,
  patch: SkillMetadata,
  now = Date.now(),
): Skill {
  const metadata = Object.fromEntries(
    Object.entries({ ...getSkillMetadata(skill), ...patch }).filter(
      ([, value]) => value,
    ),
  );
  return {
    ...skill,
    files: replaceSkillEntryFile(
      skill,
      skill.name,
      skill.description,
      getSkillBody(skill),
      metadata,
    ).map((file) =>
      file.path === SKILL_ENTRY_PATH ? { ...file, updatedAt: now } : file,
    ),
    updatedAt: now,
  };
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
const skillChars = (skill: Skill) =>
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

// Agent Skills names: lowercase letters, digits and single hyphens, at
// most SKILL_NAME_MAX_LENGTH characters, no hyphen at either end.
export function normalizeSkillName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX_LENGTH)
    .replace(/-+$/, "");
}

// `base`, or `base-2`, `base-3`… the first one no skill has; the suffix
// replaces the end of a name at the length limit.
export function uniqueSkillName(base: string, existingNames: string[]) {
  const normalized = normalizeSkillName(base) || "skill";
  const taken = new Set(existingNames.map(normalizeSkillName));
  if (!taken.has(normalized)) return normalized;
  for (let index = 2; ; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${normalizeSkillName(
      normalized.slice(0, SKILL_NAME_MAX_LENGTH - suffix.length),
    )}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function parseSkillFrontmatter(value: string) {
  const frontmatter = frontmatterOf(value);
  if (frontmatter === undefined) return { name: "", description: "" };
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

function frontmatterOf(value: string) {
  return value.match(/^---\n([\s\S]*?)\n---\n?/)?.[1];
}

// The frontmatter's `metadata` map (Agent Skills: string keys and values),
// one indented `key: value` line each.
export function parseSkillMetadata(value: string): SkillMetadata {
  const lines = (frontmatterOf(value) || "").split("\n");
  const start = lines.findIndex((line) => /^metadata:\s*$/.test(line));
  if (start < 0) return {};
  const metadata: SkillMetadata = {};
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s+([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) break;
    metadata[match[1]] = readScalar(match[2]);
  }
  return metadata;
}

// A SKILL.md written whole (by the agent or an import) keeps the earlier
// version's `metadata` when it sets none itself.
export function keepSkillMetadata(previous: string, next: string) {
  const metadata = parseSkillMetadata(previous);
  if (!Object.keys(metadata).length) return next;
  if (Object.keys(parseSkillMetadata(next)).length) return next;
  if (frontmatterOf(next) === undefined) return next;
  const { name, description } = parseSkillFrontmatter(next);
  return renderSkillMarkdown(
    name,
    description,
    stripSkillFrontmatter(next),
    metadata,
  );
}

function renderSkillMarkdown(
  name: string,
  description: string,
  body: string,
  metadata: SkillMetadata = {},
) {
  const entries = Object.entries(metadata).filter(
    ([key, value]) => /^[A-Za-z0-9_.-]+$/.test(key) && value,
  );
  const metadataLines = entries.length
    ? `metadata:\n${entries.map(([key, value]) => `  ${key}: ${yamlScalar(value)}`).join("\n")}\n`
    : "";
  return `---\nname: ${yamlScalar(normalizeSkillName(name) || "skill")}\ndescription: ${yamlScalar(description.trim())}\n${metadataLines}---\n\n${body.trim()}\n`;
}

function stripSkillFrontmatter(value: string) {
  return value.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function yamlScalar(value: string) {
  return JSON.stringify(value);
}

// A top-level key (nested `metadata` lines are indented).
function readFrontmatterValue(frontmatter: string, key: string) {
  const line = frontmatter
    .split("\n")
    .find((item) => item.startsWith(`${key}:`));
  if (!line) return "";
  return readScalar(line.slice(line.indexOf(":") + 1));
}

function readScalar(value: string) {
  const raw = value.trim();
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed.trim() : String(parsed).trim();
  } catch {
    return raw.replace(/^['"]|['"]$/g, "").trim();
  }
}
