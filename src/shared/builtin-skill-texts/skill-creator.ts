// Design sources: docs/credits.md.
export const skillCreator = {
  name: "skill-creator",
  description:
    'Create, save or improve skills (reusable instructions). Use when the user asks to make a skill, "save what we just did as a skill", turn a workflow into a skill, or fix a skill that is not used.',
  body: `# Skill creator

A skill is a \`SKILL.md\` (frontmatter \`name\` and \`description\`, then instructions) plus optional files such as \`references/*.md\`. Agents see each skill's name and description (cut at 200 characters) and read the body when a request fits; a user can also pick a skill with \`/\` in the side panel.

## Save what we just did

1. Look back over this chat: the user's goal, the steps and tools that worked, corrections the user made, dead ends to avoid, and what the final answer looked like.
2. Generalize. This run's results (totals, counts, dates, names found) are not part of the skill. Keep what stays true next time: the site or page, the columns or fields, the rules the user stated, the output format. Turn what changes into inputs ("the month to check").
3. If the user asked you to save it, save it; otherwise show the name, description and a short outline, and save after they agree.

## New skill from a description

Ask (\`ask\`) only for what is missing: what the skill does, when it should be used, what the result looks like.

## Writing it

- \`name\`: lowercase kebab-case, short and specific ("refund-report").
- \`description\`: what it does, then the words a user would say when they need it. Front-load the key words; at most 200 characters.
- Body: numbered steps in the imperative, the exact tool names (\`tabs\`, \`read\`, \`snapshot\`, \`find\`, \`act\`, \`extract\`, \`webSearch\`, \`ask\`…), how to check the result, and the output format. Explain why when a step is not obvious. Keep it under about 100 lines; move long examples or tables to \`references/\` and say when to read them.
- Steps that change things (submit, buy, send, delete, close) say to confirm with the user first unless the user's request already covers them.
- Never put secrets, credentials or personal data in a skill.

## Save

- Load the \`skills\` tool with \`toolSearch\`. \`create\` takes name, description and content (the body). \`write\` or \`patch\` change a skill or add files; changing a built-in skill saves the user's own copy.
- Template: \`skill:skill-creator/references/skill-template.md\`.

## Check

- Try two realistic requests in your head: would the description make an agent pick the skill, and would the body be enough to do the task without this chat?
- Tell the user the skill's name and how to use it: it is used automatically when a request fits, or picked with \`/name\` in the side panel.
`,
  references: {
    "references/skill-template.md": `---
name: "my-skill-name"
description: "What this skill does. Use when the user asks for <trigger phrases, sites, outputs>."
---

# Skill title

## Inputs

- What the user provides or what to ask for.

## Steps

1. ...
2. ...

## Check

- How to know the result is complete and correct.

## Output

What the final answer, file or page change looks like.
`,
  },
};
