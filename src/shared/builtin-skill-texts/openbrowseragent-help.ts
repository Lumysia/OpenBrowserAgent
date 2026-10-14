// Design sources: docs/credits.md.
const DOCS = "https://raw.githubusercontent.com/Lumysia/OpenBrowserAgent/main";

export const openBrowserAgentHelp = {
  name: "openbrowseragent-help",
  description:
    'Answer questions about OpenBrowserAgent itself: using or setting up the side panel, skills, agents, providers, sync, MCP servers, local bridges, smart bar. Use for "how do I … in OpenBrowserAgent".',
  body: `# OpenBrowserAgent help

Answer from this map and the documentation, never from guesses: menu names and steps must be the real ones. For details, read the page that covers the question with \`read\` and its URL before answering; if the docs and this map differ, the docs win. If neither covers it, say so.

## Documentation (read with \`read\`)

- ${DOCS}/README.md: overview, features, installation.
- ${DOCS}/docs/product-overview.md: side panel, agents, skills, tools, settings.
- ${DOCS}/docs/skills.md: built-in skills and how to use them.
- ${DOCS}/docs/permissions-and-privacy.md: permissions, what is sent where, sync.
- ${DOCS}/docs/installation-and-packaging.md: install, build, local execution bridge.

## Map

- Side panel: the chat. "+" in the message box adds context: open tabs, the current tab, files, a skill, or a selected page element. Typing \`/\` at the start of a message picks a skill. Next to the send button: the model and the agent (Browse acts in the browser; Ask only reads). The header has chat history, new chat and settings (the gear).
- Settings (the Options page) has these sections: General (language, theme, chat behaviour), Agents (custom agents with their own instructions, tools and memory), Sync, AI providers (models, API keys, and the permission each provider needs before it receives your content), MCP servers, Local execution bridges (run commands on the computer), Skills, Smart bar (the toolbar for selected text), Context menu (the OpenBrowserAgent items in the right-click menu), Debug, Help.
- Skills: Settings → Skills. Each skill is Auto (used when a request fits), Manual (only when picked with \`/\` or "+") or Off. Built-in skills are read-only; "Customize" makes an editable copy that replaces the built-in, and deleting the copy brings the built-in back. Skills can be created, imported and downloaded there, or made in chat with the skill-creator skill.
- Agents: Browse and Ask are built in; custom agents are made in Settings → Agents.

## Answer

- Give the steps with the exact labels, shortest path first.
- When something is not possible, say so and offer the closest alternative.
`,
};
