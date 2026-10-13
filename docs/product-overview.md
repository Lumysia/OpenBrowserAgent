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

- Skills are reusable instruction packages with a required `SKILL.md`. The built-in skills and how to use them are listed in [skills.md](skills.md).
- Built-in skills ship with the extension and update with it; they are read-only. Customizing one saves the user's own copy under the same name, which replaces the built-in until it is deleted.
- Each skill is Auto (agents see its name and description and read the full skill when a request fits), Manual (used only when the user picks it) or Off.
- In the side panel, typing `/` at the start of the message or opening "+" → Skills picks a skill for that message: the agent follows it for the request typed after it.
- Skills support import/export, duplication, editing and validation. The Options page warns when the Auto skills' descriptions get long.

### Browser Tools

Every agent starts with a small set of core tools; the rest load on demand through a tool search, so each request stays small.

- Core: `tabs` (list or search, open, switch, close, navigate, group), `snapshot` (the page as compact lines with element refs), `find` (search the whole page), `read` (page text, stored outputs, attachments, URLs, skills and workspace files in ranges; PDF and Office documents as text), `extract` (answer a question about a page with the helper model), `act` (click, double-click, type, select, press keys, scroll, wait, drag and answer JavaScript dialogs in one batch, with real debugger input where pages ignore synthetic events), `editPage` (batched in-place edits such as translation; never script), `webSearch`, `screenshot` (visible part or full page), and `ask` (questions to the user).
- On demand: export to Markdown or image zip, skills editing, workspace and memory, chat history, sub-agents, MCP tools, MCP server management, local commands (waiting or in the background) and bridges, image generation, page JavaScript (off by default), and developer diagnostics.

Tool runs are shown as visible cards with status, summaries, references, generated media, and JSON detail popovers.

### MCP Servers

Remote Streamable HTTP MCP servers add tools such as search and fetch. A server must pass **Test** (which discovers its tools) before it can be enabled, and each of its tools can be turned off. Built-in presets (Exa, Parallel, TinyFish, Firecrawl) start off; servers can also be added by URL or imported from JSON.

**Send without browser Origin** is a per-server option for servers that reject browser requests. Browsers add an `Origin` header to every request an extension makes, and some servers refuse any request that carries one (TinyFish answers `Browser-origin requests are not allowed.`). With the option on, a `declarativeNetRequest` rule removes the header from this extension's own requests to that server's exact URL. The rules follow the stored servers: they are rebuilt when the browser starts and whenever a server changes, and a request to a server with the option checks its rule first. The TinyFish preset has the option on. Turning it on or off needs a new test.

Where the browser lacks `declarativeNetRequest`, the setting says so and requests to such a server fail with a clear error instead of being sent with an `Origin` the server rejects. `npm run test:browser:mcp-origin` checks the option against TinyFish's keyless endpoint (three requests).

### Context Attachments

Users can attach current tabs, choose open tabs, upload/paste files, pick skills (with "+" or by typing `/`), and select page elements. Sent messages preserve metadata for attached tabs, selected elements, uploaded attachments, and selected skills.

### Markdown and Rich Output

Assistant output supports Markdown, syntax-highlighted code blocks with copy buttons, KaTeX math, image cards, citations, link preview cards, Mermaid previews, and Mermaid SVG/PNG download actions.

### Settings

The options UI includes General, Agents, Sync, Providers, MCP Servers, Local Execution Bridges, Skills, Debug, and Help pages.

Users can configure language, theme, accent color, chat behavior, context limits, providers, models, agents, sync, MCP servers, local execution bridges, and reusable skills.
