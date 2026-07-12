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

### Agents

- Built-in Browse agent for browser automation and broader tool usage.
- Built-in Ask agent for page-focused questions.
- Custom agents with editable capabilities and workspace files.
- Agent ZIP import/export.
- Built-in agents are read-only; custom agents are user-editable.

### Skills

- Skills are reusable instruction packages with a required `SKILL.md`.
- Built-in skills include browser automation guidance and skill creation guidance.
- Skills support import/export, duplication, editing, validation, enable/disable, and reset to built-ins.

### Browser Tools

OpenBrowserAgent includes tools for tab navigation, tab search/listing/closing/reloading/grouping, page content extraction, accessible element discovery, clicking, typing, screenshots, downloads, image extraction, uploaded attachment reading, skill/workspace/memory/history operations, MCP tool execution, and image generation.

Tool runs are shown as visible cards with status, summaries, references, generated media, and JSON detail popovers.

### Context Attachments

Users can attach current tabs, choose open tabs, upload/paste files, add skills, and select page elements. Sent messages preserve metadata for attached tabs, selected elements, uploaded attachments, and selected skills.

### Markdown and Rich Output

Assistant output supports Markdown, syntax-highlighted code blocks with copy buttons, KaTeX math, image cards, citations, link preview cards, Mermaid previews, and Mermaid SVG/PNG download actions.

### Settings

The options UI includes General, Agents, Sync, Providers, MCP Servers, Local Execution Bridges, Skills, Debug, and Help pages.

Users can configure language, theme, accent color, chat behavior, context limits, providers, models, agents, sync, MCP servers, local execution bridges, and reusable skills.
