# Product Overview

OpenBrowserAgent is a browser extension side panel for AI-assisted browsing, page understanding, research, and browser automation.

It turns the browser into an AI working surface: users can chat with a selected model, attach browser/page/file context, choose an agent, enable skills, inspect tool activity, and configure providers without leaving the browser workflow.

## Core Workflows

- Ask questions about the active page or attached tabs.
- Research topics with page context, tools, MCP servers, and source citations.
- Use the Browse agent to inspect pages, navigate tabs, click, type, download, and automate browser tasks.
- Use the Ask agent for more focused page Q&A with a smaller capability surface.
- Create custom agents with explicit capabilities, icons, instructions, memory, and workspace files.
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

Evidence: `entrypoints/sidepanel/app.tsx`, `entrypoints/sidepanel/sidepanel-view.tsx`, `entrypoints/sidepanel/history-panel.tsx`.

### Agents

- Built-in Browse agent for browser automation and broader tool usage.
- Built-in Ask agent for page-focused questions.
- Custom agents with editable capabilities and workspace files.
- Agent ZIP import/export.
- Built-in agents are read-only; custom agents are user-editable.

Evidence: `src/shared/agents.ts`, `entrypoints/options/agents-page.tsx`.

### Skills

- Skills are reusable instruction packages with a required `SKILL.md`.
- Built-in skills include browser automation guidance and skill creation guidance.
- Skills support import/export, duplication, editing, validation, enable/disable, and reset to built-ins.

Evidence: `src/shared/builtin-skills.ts`, `src/shared/skills.ts`, `entrypoints/options/skills-page.tsx`.

### Browser Tools

OpenBrowserAgent includes tools for tab navigation, tab search/listing/closing/reloading/grouping, page content extraction, accessible element discovery, clicking, typing, screenshots, downloads, image extraction, uploaded attachment reading, skill/workspace/memory/history operations, MCP tool execution, and image generation.

Tool runs are shown as visible cards with status, summaries, references, generated media, and JSON detail popovers.

Evidence: `src/shared/browser-tools.ts`, `src/background/tools.ts`, `entrypoints/sidepanel/tool-part.tsx`.

### Context Attachments

Users can attach current tabs, choose open tabs, upload/paste files, add skills, and select page elements. Sent messages preserve metadata for attached tabs, selected elements, uploaded attachments, and selected skills.

Evidence: `entrypoints/sidepanel/composer-menus.tsx`, `entrypoints/sidepanel/composer-attachments.tsx`, `entrypoints/sidepanel/file-attachments.ts`, `entrypoints/sidepanel/send-message-plan.ts`.

### Markdown and Rich Output

Assistant output supports Markdown, syntax-highlighted code blocks with copy buttons, KaTeX math, image cards, citations, link preview cards, Mermaid previews, and Mermaid SVG/PNG download actions.

Evidence: `entrypoints/sidepanel/markdown.ts`, `entrypoints/sidepanel/assistant-message-part.tsx`, `src/ui/styles/markdown.css`.

### Settings

The options UI includes General, Providers, MCP, Agents, Skills, Sync, and Debug pages.

Users can configure language, theme, accent color, auto-scroll, auto-retry, context budget, tool-step limits, providers, models, MCP servers, skills, agents, and sync behavior.

Evidence: `entrypoints/options/app.tsx`, `entrypoints/options/general-page.tsx`, `entrypoints/options/providers-page.tsx`, `entrypoints/options/mcp-page.tsx`, `entrypoints/options/sync-page.tsx`, `entrypoints/options/debug-page.tsx`.

## Product Status

The current codebase is suitable for a release candidate after manual browser QA. For a stable release, test provider setup, long streaming responses, code blocks, images, Mermaid diagrams, uploaded files, tool calls, agent/skill import/export, and narrow/dark settings layouts.
