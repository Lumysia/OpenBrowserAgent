import {
  customizeBuiltinSkill,
  inheritSkillSettings,
  resolveSkillCatalog,
} from "../../shared/skill-catalog";
import { storage } from "../../shared/storage";
import {
  SKILL_ENTRY_PATH,
  createSkillPackage,
  normalizeSkillName,
  parseSkillFrontmatter,
  skillFileKind,
} from "../../shared/skills";
import { TOOL_NAME } from "../../shared/tool-names";
import type { Skill } from "../../shared/types";
import { fail, ok, schema, stringArg, type ToolDefinition } from "./types";

// Creating and editing skills. Reading goes through read "skill:NAME".
export const skillsTool: ToolDefinition = {
  name: TOOL_NAME.skills,
  group: "skills",
  onDemand: true,
  summary: "Create or edit skills (reusable instructions)",
  description:
    "Create a skill (name in kebab-case, description: when to use it, content: the SKILL.md body) or change one: write (name, path, content) replaces or adds a file; patch (name, path, find, content) replaces one exact text. Changing a built-in skill saves the user's own copy, which replaces it. Only save broadly reusable workflows; never secrets or one-off details.",
  parameters: schema(
    {
      action: { type: "string", enum: ["create", "write", "patch"] },
      name: { type: "string" },
      description: { type: "string" },
      path: { type: "string", description: `Defaults to ${SKILL_ENTRY_PATH}.` },
      content: { type: "string" },
      find: { type: "string" },
    },
    ["action", "name"],
  ),
  async execute(input, { run }) {
    const action = stringArg(input.action);
    const name = normalizeSkillName(stringArg(input.name));
    if (!name) return fail("name is required (kebab-case).");
    const [all, settings] = await Promise.all([
      storage.skills.get(),
      storage.skillSettings.get(),
    ]);
    const entry = resolveSkillCatalog(all, settings).find(
      (item) => normalizeSkillName(item.skill.name) === name,
    );
    if (action === "create") {
      if (entry) return fail(`Skill ${name} exists; use write or patch.`);
      const content = String(input.content ?? "").trim();
      if (!content)
        return fail("content (the SKILL.md instructions) is required.");
      const skill = createSkillPackage({
        name,
        description: stringArg(input.description),
        instruction: content,
      });
      await storage.skills.set([...all, skill]);
      run.skills.push(skill);
      return ok(`Created skill ${name}.`, { action, name });
    }
    if (!entry)
      return fail(
        `No skill ${name}. Skills: ${run.skills.map((skill) => skill.name).join(", ")}`,
      );
    // Built-ins are read-only: the change goes to the user's copy.
    const customized =
      entry.source === "builtin"
        ? customizeBuiltinSkill(entry.skill)
        : undefined;
    const existing = customized || entry.skill;
    const path = stringArg(input.path) || SKILL_ENTRY_PATH;
    const file = existing.files.find((item) => item.path === path);
    let content = String(input.content ?? "");
    if (action === "patch") {
      if (!file) return fail(`Skill ${name} has no file ${path}.`);
      const find = String(input.find ?? "");
      const matches = find ? file.content.split(find).length - 1 : 0;
      if (matches !== 1)
        return fail(
          matches
            ? "find matches more than once; include more context."
            : "find was not found; read the file first.",
        );
      content = file.content.replace(find, () => content);
    } else if (action !== "write")
      return fail('action must be "create", "write" or "patch".');
    const now = Date.now();
    const meta = parseSkillFrontmatter(
      path === SKILL_ENTRY_PATH ? content : "",
    );
    const next: Skill = {
      ...existing,
      ...(meta.name ? { name: normalizeSkillName(meta.name) } : {}),
      ...(meta.description ? { description: meta.description } : {}),
      files: [
        ...existing.files.filter((item) => item.path !== path),
        {
          path,
          kind: file?.kind || skillFileKind(path),
          encoding: file?.encoding || "utf-8",
          content,
          updatedAt: now,
        },
      ],
      updatedAt: now,
    };
    await storage.skills.set(
      customized
        ? [...all, next]
        : all.map((skill) => (skill.id === existing.id ? next : skill)),
    );
    if (customized)
      await storage.skillSettings.update((current) =>
        inheritSkillSettings(current, entry.skill.id, customized.id),
      );
    const index = run.skills.findIndex(
      (skill) => normalizeSkillName(skill.name) === name,
    );
    if (index >= 0) run.skills[index] = next;
    return ok(
      `${action === "patch" ? "Patched" : "Wrote"} ${name}/${path}${customized ? " (saved as the user's copy of the built-in skill)" : ""}.`,
      { action, name, path },
    );
  },
};
