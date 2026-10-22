# Product Overview

OpenBrowserAgent is a browser extension side panel for AI-assisted browsing, page understanding, research, and browser automation.

It turns the browser into an AI working surface: users can chat with a selected model, attach browser/page/file context, choose an agent, enable skills, inspect tool activity, and configure providers without leaving the browser workflow.

## Core Workflows

- Ask questions about the active page or attached tabs.
- Research topics with page context, tools, MCP servers, and source citations.
- Use the Browse agent to read pages, navigate tabs, click, type, edit pages, download, and automate browser tasks.
- Use the Ask agent for focused page Q&A: it reads pages but does not operate the browser.
- Create custom agents with their own instructions, tool groups, model, icon, and an optional workspace with memory.
- Create/import reusable skills for repeatable workflows, or record one by doing the task once (teach mode).
- Schedule tasks for later or on a schedule, and watch pages for a change you describe, with a notification when there is something to tell.
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
- **Teach mode** ("+" → Record a skill): the user does a task once while the side panel lists each step; on Stop the chat model writes an ordinary skill (`SKILL.md` plus `references/demonstration.json`, the steps' targets as hints, never typed values), the user reviews its name and description, and a check run in a new tab marks it verified. Recorded skills start as Manual; after a passed check the side panel offers Auto. See [Record a skill](skills.md#record-a-skill).

### Browser Tools

Every agent starts with a small set of core tools; the rest load on demand through a tool search, so each request stays small.

- Core: `tabs` (list or search, open, switch, close, navigate, group), `snapshot` (the page as compact lines with element refs), `find` (search the whole page), `read` (page text, stored outputs, attachments, URLs, skills and workspace files in ranges; PDF and Office documents as text), `extract` (answer a question about a page with the helper model), `act` (click, double-click, type, select, press keys, scroll, wait, drag and answer JavaScript dialogs in one batch, with real debugger input where pages ignore synthetic events), `editPage` (batched in-place edits such as translation; never script), `webSearch`, `screenshot` (visible part or full page), and `ask` (questions to the user).
- On demand: downloads (download a URL with the browser's cookies, save text, workspace files, attachments or a tab as Markdown to the Downloads folder, a tab's images as a zip, and list, wait for, cancel or retry downloads; downloads a click starts are reported with that step), skills editing, workspace and memory, running JavaScript in a sandbox (`runCode`: calculations, CSV/JSON parsing and data reshaping, with workspace files in and out; no network, see [Code sandbox](permissions-and-privacy.md#code-sandbox)), chat history, sub-agents, MCP tools, MCP server management, local commands (waiting or in the background) and bridges, image generation, page JavaScript (off by default), developer diagnostics, and scheduled tasks (`tasks`, see below).

Tool runs are shown as visible cards with status, summaries, references, generated media, and JSON detail popovers.

The agent works next to the user, not in their way. Each run is bound to a tab: the one the message was sent from (the attached tab, or the page of a smart bar or context menu request), then the last tab the agent named, opened, navigated or switched to. Page tools that name no tab use it, never the tab the user has in front now, so switching tabs mid-task does not move the agent; if the tab is closed, the tool says so instead of using another tab. Sub-agents start on their parent's tab, and the next message of a chat names the tab the agent last worked on. Tabs open in the background, screenshots and real debugger input reach background tabs, and a tab a background page opens is put behind the user's tab again. The agent brings a tab to the front only when asked (`tabs` switch, or open with `show`). Safari can capture only the tab in front, so a screenshot there shows the tab for a moment and puts the user's tab back.

### Scheduled Tasks and Watches

A task runs an agent on its own while the browser is open: once at a time, every N minutes, hours or days, daily or weekly at a clock time in the user's time zone (a daily 09:00 stays 09:00 across daylight saving changes), or as a **watch** of a page. Each run is an ordinary chat in chat history, linked to its task, that the side panel can follow live or open later.

- **Task list.** The calendar button in the side panel's header opens the task list next to chat history: each task's schedule, state (running, paused, needs you, needs your OK, runs on another device, needs a newer version), last result and next run, with **Run now**, **Pause**/**Resume**, **Edit** and **Delete**. Clicking a task opens the chat of its last run. **New task** opens the form: title, what to do (for a watch, the condition and what to report), when, the agent, and with more than one device, which device runs it.
- **From a chat.** **Make this a task** under a message of the user opens the form prefilled with that request and the chat's agent; a message sent with an element picked on a page prefills a watch of that element. The agent can also manage tasks when asked in words ("check this page every hour and tell me when the price drops", "move my news task to the evening", "stop the price watch") with the on-demand `tasks` tool: list them (schedule, agent, device, state, last result, next run), look at one with its recent runs, create, change (title, instructions, schedule, agent, on or off), run now, pause, resume or delete them. It belongs to the **Scheduled tasks** tool group, which Browse and new custom agents have and Ask does not, and it is not offered in task runs. Each step says what was done. The user asked for it in the chat, so a task created or changed with it runs as made, without a separate OK. A task created with it runs with the chat's agent; the tool never changes what an agent may do.
- **Your OK on each device.** A task runs on a device only as the user allowed it there. Tasks made or edited in the task list, or with the agent in a chat, are allowed as made. A task that came by sync from another device (new, or its instructions, schedule or agent changed there) waits as **Needs your OK**: the task list shows **Allow** and **Discard** (back to what was allowed, or deleted when it never was), the toolbar badge counts it and one notification says so. Renaming or pausing needs no OK. An agent's **Act on its own** permission that was turned on, or whose tool groups changed, on another device counts on this device only after **Allow** here (on a waiting task, or in the agent's settings); until then its tasks wait. These OKs stay on the device and never sync.
- **Watches.** A watch checks its page at most once a minute (every 5 minutes by default) in a background tab. Each check reads the watched part (the page's main content, or an element picked with **Pick on page**, found again by its place in the page structure) without a model and compares it with the last check. The agent runs only when the text changed, or for the first look, and gets the changed lines before and after as untrusted page content; it reports whether the condition holds. Unchanged pages cost no model request.
- **Read-only by default.** Runs get only tools that read and report. An agent may use its acting tools (click, type, submit, edit pages, download, local commands, MCP tools without `readOnlyHint`) in task runs only when its **Act on its own** permission is on: off for every agent, never available for the built-in Browse and Ask, and not carried by agent archives. A run that wants to ask the user something stops, and the task waits as **Needs you**. See [Scheduled tasks and watches](permissions-and-privacy.md#scheduled-tasks-and-watches).
- **Results.** A system notification (Chromium, Firefox) when a task has something to tell, a watch's condition comes to hold (once, not again while it keeps holding), a task needs the user or waits for the user's OK, or a task was paused; clicking it opens the run's chat in the side panel. A run that ends without saying whether it has something to tell is shown as **Answered** in the list, without a notification. The toolbar button shows a count of results not yet seen in the task list and of tasks waiting for the user's OK (the only signal on Safari, which has no notifications).
- **Reliability.** Tasks are timed with `chrome.alarms` and armed again whenever the service worker starts, after runs cut off by a stop are recovered. Runs go one at a time; a task never runs twice at once. A run cut off by a worker restart is retried once; runs missed while the browser was closed run once when it starts again, not once per missed time; three failed runs in a row pause the task. A check that cannot reach its page because the browser is offline or the page did not load is skipped, not counted as a failure. Tabs a run opened close when it ends. Editing a task's title, agent or device keeps its schedule; a changed schedule or instructions start it over. Settings → General → Scheduled tasks has one switch that pauses every task.
- **Sync.** Task definitions sync with the settings; each task runs only on the device that created it (changeable in the form), so two computers never run the same task. A copied browser profile takes a new task device id when sync finds the copy, and the old device's tasks stay listed under it to move. What a device learned while running a task (last run, last result, the watched text, failures, the user's OKs) stays on that device. A task with a schedule from a newer version is kept, synced as it is and shown as needing a newer version; it does not run.

### MCP Servers

Remote Streamable HTTP MCP servers add tools such as search and fetch. A server must pass **Test** (which discovers its tools) before it can be enabled, and each of its tools can be turned off. Recommended servers (Exa, Parallel, TinyFish, Firecrawl) are added with one click and start off; servers can also be added by URL or imported from JSON. Every server can be deleted; a deleted recommended server is offered again.

**Send without browser Origin** is a per-server option for servers that reject browser requests. Browsers add an `Origin` header to every request an extension makes, and some servers refuse any request that carries one (TinyFish answers `Browser-origin requests are not allowed.`). With the option on, a `declarativeNetRequest` rule removes the header from this extension's own requests to that server's exact URL. The rules follow the stored servers: they are rebuilt when the browser starts and whenever a server changes, and a request to a server with the option checks its rule first. The TinyFish preset has the option on. Turning it on or off needs a new test.

Where the browser lacks `declarativeNetRequest`, the setting says so and requests to such a server fail with a clear error instead of being sent with an `Origin` the server rejects. `npm run test:browser:mcp-origin` checks the option against TinyFish's keyless endpoint (three requests).

### Context Attachments

Users can attach current tabs, choose open tabs, upload/paste files, pick skills (with "+" or by typing `/`), and select page elements. Sent messages preserve metadata for attached tabs, selected elements, uploaded attachments, and selected skills.

### Page Translation

"Translate this page" in the right-click menu translates the whole page in place, keeping the original: each paragraph gets its translation underneath, in the page's own font. Paragraphs on and near the screen go first, the rest as the user scrolls, and content the page adds later is translated too. Links, emphasis and inline code stay in the translation (copies of the page's own elements; nothing from the engine becomes markup). Code blocks, form fields and text marked `translate="no"` are left alone. The same menu item then reads "Show original", which removes every translation and restores the page exactly.

Settings → On pages → Translate picks the engine (the browser's on-device translator by default, which says so on the page where the browser has none or can't translate a page; the AI model, with a model of its own if wanted in the Models table; or Google's or Microsoft's free translation, which send the page text to them), the language (under General → "Translate into"; the extension's language by default) and the display (original and translation, or translation only). Translations are saved on the device for 30 days. Details on what is sent: [Permissions and Privacy](permissions-and-privacy.md#page-translation).

### Markdown and Rich Output

Assistant output supports Markdown, syntax-highlighted code blocks with copy buttons, KaTeX math, image cards, citations, link preview cards, Mermaid previews, and Mermaid SVG/PNG download actions.

### Settings

The options UI has six pages and Help: General, AI providers & models, Agents & skills (two tabs), On pages (Translate, Smart bar, Right-click menu), Sync, and Advanced (MCP servers, local execution bridges, Troubleshooting). A setup page opens on install. Older page links (`#/smart-bar`, `#/page-translation`, …) open the matching tab.

Users can configure language, theme, accent color, chat behavior, context limits, providers, models, agents, sync, MCP servers, local execution bridges, and reusable skills.

A provider on another server receives the user's content only after the user agrees for that provider's host, in the provider form or when the side panel or smart bar first asks; see [Permissions and Privacy](permissions-and-privacy.md#permission-before-content-is-sent).
