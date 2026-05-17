import type { Skill } from "./types";

const SKILL_CREATOR_ID = "builtin-skill-creator";

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: SKILL_CREATOR_ID,
    name: "skill-creator",
    description:
      "Create, improve, review, package, and troubleshoot OpenBrowserAgent skills. Use whenever the user asks to make a new skill, turn a workflow into a reusable skill, import or edit a SKILL.md package, optimize skill triggering, design references/assets/scripts, or debug why a skill was not selected.",
    builtin: true,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    files: [
      {
        path: "SKILL.md",
        kind: "markdown",
        encoding: "utf-8",
        updatedAt: 0,
        content: `---
name: "skill-creator"
description: "Create, improve, review, package, and troubleshoot OpenBrowserAgent skills. Use whenever the user asks to make a new skill, turn a workflow into a reusable skill, import or edit a SKILL.md package, optimize skill triggering, design references/assets/scripts, or debug why a skill was not selected."
---

# Skill Creator

Use this skill to create or improve OpenBrowserAgent skill packages. A skill is a folder-like package stored in browser storage with a required \`SKILL.md\` file and optional bundled files under \`references/\`, \`assets/\`, and \`scripts/\`.

## Core Workflow

1. Capture the user's intent before writing.
2. Identify when the skill should trigger and when it should not.
3. Draft \`SKILL.md\` with YAML frontmatter and concise instructions.
4. Add supporting files only when they reduce context or repeated work.
5. Review the result against realistic user prompts.
6. Package or present the skill so it can be imported as a ZIP.

If the current conversation already contains the workflow to capture, extract the steps, tools used, corrections, inputs, outputs, and edge cases from the conversation before asking new questions.

## Required Package Shape

\`\`\`
skill-name/
├── SKILL.md
├── references/
├── assets/
└── scripts/
\`\`\`

Only \`SKILL.md\` is required. OpenBrowserAgent can import this structure from a ZIP and stores it as package files. Supporting files are read on demand with \`readSkillFile\`.

## Writing SKILL.md

Use the template in \`references/skill-template.md\` when creating a new skill.

The frontmatter must include:

- \`name\`: lowercase kebab-case identifier, matching the folder name when packaged.
- \`description\`: the primary trigger. Include what the skill does and specific contexts where it should be used.

The body should include only the operational knowledge needed after activation. Keep it under 500 lines. Move detailed schemas, long examples, lookup tables, and templates into supporting files.

## Description Optimization

Descriptions should be explicit and a little pushy because skills tend to under-trigger. Include trigger phrases, adjacent use cases, and exclusions.

Bad:

\`\`\`yaml
description: "Creates spreadsheets."
\`\`\`

Good:

\`\`\`yaml
description: "Create, inspect, transform, and format Excel spreadsheets. Use when the user mentions .xlsx, workbook, worksheet, formulas, pivots, charts, conditional formatting, or asks to turn tabular data into a spreadsheet. Do not use for plain prose documents or PDFs."
\`\`\`

## Supporting Files

- Put long documentation in \`references/\` and mention when to read each file from \`SKILL.md\`.
- Put reusable output templates in \`assets/\`.
- Put deterministic automation in \`scripts/\`, but in OpenBrowserAgent scripts are imported as files and are not executed automatically.

## Safety And Fit

Do not create misleading skills, hidden data-exfiltration behavior, credential collection, malware, exploit workflows, or instructions that would surprise the user. If a skill needs sensitive inputs, state that clearly in \`SKILL.md\`.

## Review Checklist

Before presenting a skill, read \`references/quality-checklist.md\` and verify the package against it.
`,
      },
      {
        path: "references/skill-template.md",
        kind: "markdown",
        encoding: "utf-8",
        updatedAt: 0,
        content: `---
name: "my-skill-name"
description: "What this skill does. Use when the user asks for specific trigger phrases, adjacent workflows, file types, tools, or outputs. Include exclusions when useful."
---

# Skill Title

One sentence describing the capability.

## When To Use

- Use when ...
- Also use when ...
- Do not use when ...

## Inputs

- Expected user inputs, files, pages, or context.
- Required assumptions or missing information to ask for.

## Workflow

1. Step one.
2. Step two.
3. Step three.

## Output

Define the expected final response, file, or browser action.

## Examples

Input: ...
Output: ...

## Bundled Resources

- \`references/example.md\`: read when ...
- \`assets/template.md\`: use when ...
- \`scripts/tool.py\`: available as reference only unless the host explicitly supports script execution.
`,
      },
      {
        path: "references/quality-checklist.md",
        kind: "markdown",
        encoding: "utf-8",
        updatedAt: 0,
        content: `# Skill Quality Checklist

- The package has exactly one required entry file: \`SKILL.md\`.
- The \`name\` is lowercase kebab-case and matches the intended folder name.
- The \`description\` says both what the skill does and when to use it.
- The description includes realistic trigger phrases and useful exclusions.
- The body is concise and operational, not a generic essay.
- Supporting files are referenced from \`SKILL.md\` with clear read/use conditions.
- Long examples, schemas, and templates live in \`references/\` or \`assets/\`.
- Scripts are treated as optional bundled resources and are not assumed to execute automatically.
- The skill avoids secrets, hidden network behavior, surprise side effects, and unsafe instructions.
- The skill has at least two realistic test prompts or example scenarios.
`,
      },
    ],
  },
];

export function mergeBuiltinSkills(skills: Skill[]) {
  const existing = new Set(skills.map((skill) => skill.id));
  const missing = BUILTIN_SKILLS.filter((skill) => !existing.has(skill.id));
  return missing.length ? [...missing, ...skills] : skills;
}
