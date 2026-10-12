# Product Overview

OpenBrowserAgent is a browser extension side panel for AI-assisted browsing, page understanding, research, and browser automation.

It turns the browser into an AI working surface: users can chat with a selected model, attach browser/page/file context, choose an agent, enable skills, inspect tool activity, and configure providers without leaving the browser workflow.

## Core Workflows

- Ask questions about the active page or attached tabs.
- Research topics with page context, tools, MCP servers, and source citations.
- Use the Browse agent to read pages, navigate tabs, click, type, edit pages, download, and automate browser tasks.
- Use the Ask agent for focused page Q&A: it reads pages but does not operate the browser.
- Create custom agents with their own instructions, tool groups, model, icon, and an optional workspace with memory.
- Create/import reusable skills for repeatable workflows.
- Configure model providers, chat models, image models, sync preferences, MCP servers, and UI settings.

## Key Features

### Sidepanel Chat

- Streaming assistant responses.
- Stop and send controls.
- Queued messages while a stream is active.
- Auto-scroll that follows only when appropriate and lets users scroll away.
- Chat history with rename, delete, import, export, and clear-all actions.
- Context chips for tabs, files, skills, and selected page elements.
- Prompt usage preview and visible tool activity.

### Agents

- Built-in Browse agent for browser automation and broader tool usage.
- Built-in Ask agent for page-focused questions.
- Every agent has the same shape: instructions, tool groups, an optional model, and an optional private workspace (files plus MEMORY.md and USER.md). Browse and Ask are built-in presets.
- Agents can delegate tasks to sub-agents, which run in the background (also with the side panel closed) in their own linked chats.
- Agent ZIP import/export.
- Built-in agents are read-only; custom agents are user-editable.

### Skills

- Skills are reusable instruction packages with a required `SKILL.md`.
- Built-in skills cover local execution bridge setup and skill creation. Agents see each skill's name and description and read the full skill only when it fits the task.
- Skills support import/export, duplication, editing, validation, enable/disable, and reset to built-ins.

### Browser Tools

Every agent starts with a small set of core tools; the rest load on demand through a tool search, so each request stays small.

- Core: `tabs` (list, open, switch, close, navigate), `snapshot` (the page as compact lines with element refs), `find` (search the whole page), `read` (page text, stored outputs, attachments, URLs, skills and workspace files in ranges), `extract` (answer a question about a page with the helper model), `act` (click, type, select, press keys, scroll, wait, drag in one batch), `editPage` (batched in-place edits such as translation), `webSearch`, `screenshot`, and `ask` (questions to the user).
- On demand: export to Markdown or image zip, skills editing, workspace and memory, chat history, sub-agents, MCP servers and their tools, local commands and bridges, image generation, page JavaScript (off by default), and developer diagnostics.

Tool runs are shown as visible cards with status, summaries, references, generated media, and JSON detail popovers.

### Context Attachments

Users can attach current tabs, choose open tabs, upload/paste files, add skills, and select page elements. Sent messages preserve metadata for attached tabs, selected elements, uploaded attachments, and selected skills.

### Markdown and Rich Output

Assistant output supports Markdown, syntax-highlighted code blocks with copy buttons, KaTeX math, image cards, citations, link preview cards, Mermaid previews, and Mermaid SVG/PNG download actions.

### Settings

The options UI includes General, Agents, Sync, Providers, MCP Servers, Local Execution Bridges, Skills, Debug, and Help pages.

Users can configure language, theme, accent color, chat behavior, context limits, providers, models, agents, sync, MCP servers, local execution bridges, and reusable skills.
