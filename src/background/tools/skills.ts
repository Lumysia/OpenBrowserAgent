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
    "Create a skill (name in kebab-case, description: when to use it, content: the SKILL.md body) or change one: write (name, path, content) replaces or adds a file; patch (name, path, find, content) replaces one exact text. Only save broadly reusable workflows; never secrets or one-off details.",
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
    const all = await storage.skills.get();
    const existing = all.find(
      (skill) => normalizeSkillName(skill.name) === name,
    );
    if (action === "create") {
      if (existing) return fail(`Skill ${name} exists; use write or patch.`);
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
    if (!existing)
      return fail(
        `No skill ${name}. Skills: ${all.map((skill) => skill.name).join(", ")}`,
      );
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
      all.map((skill) => (skill.id === existing.id ? next : skill)),
    );
    const index = run.skills.findIndex((skill) => skill.id === existing.id);
    if (index >= 0) run.skills[index] = next;
    return ok(`${action === "patch" ? "Patched" : "Wrote"} ${name}/${path}.`, {
      action,
      name,
      path,
    });
  },
};
