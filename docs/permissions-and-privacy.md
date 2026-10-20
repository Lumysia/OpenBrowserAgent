# Permissions and Privacy

OpenBrowserAgent is powerful because it can read browser context, automate pages, and send selected context to user-configured AI providers. This page documents what permissions are used for and what data can flow through the extension.

## Browser Permissions

Permissions differ by browser target.

All builds declare:

- `scripting`: inject scripts/CSS for page text extraction, element selection, DOM interaction, input, scrolling, and content capture.
- `tabs`: read tab metadata, list tabs, open/close/reload/navigate tabs (in the background; a tab is brought to the front only when the user asks), and attach tab context to chats.
- `webNavigation`: tell which tabs a page the agent works on opened (a link with a target, `window.open`), so the user's own tab goes back in front of them. Only the opener of new tabs is read during an `act` call. In a tab where the user translated a page, the main frame's navigations tell when to translate the next page and when a reload ends that; only the tab IDs are kept, in session storage.
- `storage`: persist settings, providers, agents, skills, MCP servers, chats, workspaces, language, and sync status.
- `unlimitedStorage`: allow local chat and attachment storage to grow beyond normal extension storage quotas; browser-sync quotas still apply.
- `alarms`: check for sync changes once a minute while an extension page is visible, and start [scheduled tasks and watches](#scheduled-tasks-and-watches) on time (one alarm per task, named apart from sync's), also after the service worker stopped.
- `declarativeNetRequestWithHostAccess`: remove the `Origin` header from the extension's own requests to MCP servers that have **Send without browser Origin** turned on (see [MCP servers](product-overview.md#mcp-servers)). Each rule matches only that server's exact URL and requests this extension makes; other requests and pages are untouched.
- `contextMenus`: the OpenBrowserAgent submenu in the right-click menu (ask about or summarize the page, translate the page or a video's subtitles, search the web, summarize a linked page, copy the page as Markdown). It can be turned off in Settings → On pages → Right-click menu. Safari shows it on macOS only.
- `downloads`: save Markdown exports, image ZIPs, Mermaid downloads, generated images, and fetched files.
- `<all_urls>` host access: allow extension tools to work across arbitrary pages, provider endpoints, MCP servers, and remote image/file URLs. Manifest V3 lists this under `host_permissions`; Manifest V2 includes it in `permissions`.

Chrome/Chromium builds additionally declare:

- `sidePanel`: provide the extension side panel.
- `tabGroups`: name and color the tab groups the agent creates with `tabs` (group, ungroup), and show group names in tab lists.
- `debugger`: real mouse and keyboard input where pages ignore synthetic events (rich text editors, `trusted` or coordinate `act` steps), answering a JavaScript dialog that opened outside an `act` batch, screenshots of a tab in the background, full-page screenshots, page JavaScript (`runScript`, off by default), and developer diagnostics (network resources, device emulation). The debugger attaches only for those calls.
- `offscreen`: one hidden offscreen document does DOM work the service worker cannot: it turns fetched HTML into Markdown, holds the blob URLs of files the agent saves, and hosts the sandboxed page of the [code sandbox](#code-sandbox).

Chromium and Firefox additionally declare:

- `search`: run web searches through the browser's configured default search engine.
- `nativeMessaging`: connect to a separately installed local execution bridge, which can execute shell commands when enabled for the active agent.
- `notifications`: a system notification when a scheduled task has a result, a watch's condition is met, a task needs the user, or a task was paused after repeated failures. Clicking it opens the run's chat in the side panel. Safari has no notifications API and does not declare it: there the toolbar button's badge and the task list show the same results.

Firefox and Safari omit the Chrome-only `tabGroups`, `sidePanel` and `debugger` permissions. Firefox captures a background tab with `tabs.captureTab`; Safari can capture only the tab in front, so a screenshot shows the tab for a moment and then puts the user's tab back. Firefox uses `sidebar_action` for its sidebar. Safari also omits `search` and `nativeMessaging`; its action opens or focuses `sidepanel.html` as an extension tab.

Builds for browsers with sandboxed pages (Chrome and other Chromium browsers, Firefox) also declare one sandboxed page, `code-sandbox.html` (`sandbox.pages`), with its own CSP: `sandbox allow-scripts; default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:` (no `unsafe-eval`, no network). See [Code sandbox](#code-sandbox).

The extension page CSP allows images from `self`, `data:`, `blob:`, `http:`, and `https:` so rendered Markdown images, generated images, and Mermaid previews can display. Images that an answer links from other sites do not load on their own: the answer shows a placeholder, and the image is fetched only after the user chooses Load image (or opens it in a tab). A prompt-injected page therefore cannot leak data through an image URL. Images the extension made itself (`data:` and `blob:` URLs) still show directly.

## Scheduled tasks and watches

Tasks run an agent later, on a schedule, or when a watched page changes, while the browser is open. They run without anyone watching, so:

- **They only look by default.** A task's run gets only the tools that read (pages, search, extraction, screenshots) and report. Each tool declares whether it reads or acts; MCP tools count as reading only when their server marks them read-only (`readOnlyHint`). Tools that click, type, submit, change pages, download, write stored data or run local commands are not offered at all, not merely discouraged in the prompt. An agent may act on its own only when the user turns on its **Act on its own** permission, which is off for every agent (built-in agents cannot have it), is never set by the agent and is not carried by agent archives; even then the run is limited to that agent's own tool groups.
- **Nothing runs that the user did not allow on this device.** A task runs on a device only as the user allowed it there: tasks made or edited in that device's task list are allowed as made. A task the agent created, changed or turned back on, and a task that came by sync from another device (new, or its instructions, schedule or agent changed there), does not run until the user chooses **Allow** in the task list or on the agent's step; **Discard** goes back to what was allowed. Likewise an agent's **Act on its own** permission turned on, or its tool groups changed, on another device lets that agent act on this device only after the user allows it here. What the user allowed is kept in local extension storage (the allowed instructions, schedule, agent and on/off of each task, and the tool groups of each agent allowed to act) and never synced, so someone who can change the synced settings cannot make a task run here unseen.
- **The agent's task tool** (Scheduled tasks tool group; the built-in Ask agent does not have it) lists and changes tasks only in chats the user is in, never in task runs, and never changes what an agent may do.
- **No questions.** A run that would ask the user something stops, the task pauses as needing the user, and a notification says so.
- **Background tabs.** Runs open pages in background tabs in the agent's tab group, never in the user's tabs and never in front (a screenshot that could only be taken by showing the tab fails instead); the tabs a run opened are closed when it ends. Code the agent runs (`runCode`) cannot save workspace files in a run that only looks.
- **Watches read before they ask a model.** Each check reads the watched part of the page (the page's main content, or an element the user picked on it) without a model, normalizes it and compares a SHA-256 hash with the last one. Only when the text changed (or for the first look) does the agent run, and it gets the changed lines before and after (at most 8,000 characters each) marked as untrusted page content. The device keeps the hash, a short key per line (to find where the next change is) and at most 20,000 characters of the watched text (its start and end), in local extension storage, to show the next change.
- **Where data lives.** Task definitions (title, instructions, schedule, watched address, agent and the device that runs it) sync with the settings when sync is on; each task runs only on its device. What a device learned while running a task (last run, last result, the watched text, failure count) stays on that device. Each run is an ordinary chat in chat history.
- **Control.** Every task can be paused, run now, edited or deleted in the side panel's task list; three failed runs in a row pause a task; one setting pauses every task.

## Teach mode (recording)

**+ → Record a skill** records a task the user shows once, in the tab where it started and the tabs it opens, until the user stops it, the tab closes or 15 minutes pass without a step.

- **What it captures.** Only trusted user input (`isTrusted`) in the page's top frame, read in the capture phase through shadow DOM: clicks, choices in selects, checkboxes and radios, fields once committed (on leaving the field or pressing Enter), Enter, Escape and shortcut keys, and from the browser the pages the tab goes to, tabs it opens, and the site of another tab the user switches to. Each step keeps what its element means: role and accessible name (as the agent's snapshot names it), label, placeholder, the `name` and `id` attributes (ids that look generated are dropped), where a link goes, the surrounding container and nearest heading, a tag path as a last-resort hint, and the page title. Pages are kept as origin and path, with record ids replaced by `*`.
- **What it never captures.** What the user types: a field step records only which field, its input type and the length of the entry. Pages often show what was typed elsewhere (a suggestion "Search for …", a results title or heading, a path such as `/search/<term>`), on the same page or the next: before a step leaves the page, every text in it loses such echoes, which become «typed value». To find echoes on later pages of the recording, it keeps a keyed fingerprint (HMAC-SHA-256) of each non-secret value in `storage.session` for the recording, never the value; values shorter than three letters or digits are not looked for. No query strings, fragments or credentials of URLs, no coordinates, no screenshots, and nothing from the extension's own page UI (known by identity inside the extension, which pages cannot imitate). When the user presses or types on the page and the recorder sees no event for it (the page stopped the events first), or works in an embedded frame (only the top frame is recorded), the step list warns that steps may be missing.
- **Secret fields.** A field is secret when it is or was a password field (also after a show-password toggle, in shadow DOM too), the page masks it with CSS (`-webkit-text-security`), its `autocomplete` is `current-password`, `new-password`, `one-time-code` or a `cc-*` token, or its id, name, label or placeholder names a password, passcode, PIN, one-time or verification code, 2FA, security code, card number, CVV, SSN, API key, token or secret, in the languages the extension ships in. Secret fields are marked sensitive; their choice in a select is not kept either. The same rule masks secret field values in the agent's page snapshot. A field that turns secret later is judged again when an example is ticked and when the skill is saved. A field the page turned from password to text before the recording started looks like any text field.
- **Example values.** The value of a non-secret field stays in the recorder inside the page, for that page only. It leaves the page only when the user ticks "keep as an example" on that step, and then it becomes part of the skill (and syncs with it).
- **Where it lives.** While recording and until saved, the steps are in `storage.session` (gone when the browser closes). On **Stop** the steps go once to the chat model as text, with «value withheld» markers, to write the skill. Saving stores an ordinary skill: `SKILL.md` and `references/demonstration.json`, which syncs like other skills.
- **The check run** is a normal chat run with the usual tools in a new tab. The agent asks for inputs in the chat but never for a secret one: the user fills it on the page or the browser fills it. It asks before a final submit, purchase, send or delete.
- **The agent does not work in a tab that is being recorded**: runs that would start there, and page tools aimed at it, are refused.

## Code sandbox

The on-demand `runCode` tool lets the agent run JavaScript it writes, for exact calculations, parsing CSV or JSON and reshaping data. The code runs on the user's device and never in the extension's own JavaScript engine:

- **Interpreter.** QuickJS-ng compiled to WebAssembly (`quickjs-emscripten-core` with the `@jitl/quickjs-ng-wasmfile-release-sync` variant, MIT). The `.wasm` file ships in the package (`code-sandbox/quickjs.wasm`) and is never fetched from a server; nothing uses `eval` or `new Function`. The code sees only what the tool defines: captured `console` output, `input` (a JSON value the agent passes), `readFile` for the workspace files the call lists, and `writeFile`. There is no `fetch`, DOM, timers, `chrome`/`browser` APIs or module loading.
- **Worker.** Each call starts a new Worker that is terminated when the call ends, so nothing carries over between calls.
- **Sandboxed page.** On Chrome the Worker is created inside `code-sandbox.html`, a sandboxed page with an opaque origin and no extension APIs, embedded in the offscreen document. Its CSP has `default-src 'none'`, so neither the page nor its `blob:` Worker can make network requests. The embedding page sends it the Worker's source and the interpreter; results come back over a `MessageChannel`. Firefox 154 and later host the same page in the background page. Safari has no sandboxed pages, and Firefox before 154 ignores the key (the page then reports that it is not isolated and is not used): there the Worker runs from the background page and the interpreter is the boundary. A sandboxed page that fails to start or stops answering is never replaced by a plain Worker: the call fails with an error (a page that does not start is tried once more), and the next call builds a new page.
- **Limits.** 10 s by default and at most 30 s (an interrupt stops the code at the deadline; if it does not stop, the Worker is terminated 2 s later), 128 MB of interpreter memory, a 256 KB interpreter stack, and 1,000,000 characters of console output, result and error together per call. Written files follow the workspace limits (48,000 characters per file, 96,000 for the whole workspace), checked while the code runs. At most 2 calls run at once; others wait their turn, and their time limit starts when they do. The model sees the usual tool output cap; longer output is kept as a stored output it can read in ranges.
- **Data.** Files the code writes are saved to the agent's workspace with the same checks as the `workspace` tool; agents without a workspace can read and write no files. The result text goes to the AI provider like any other tool result. The code itself comes from the model, so stores count it as remote code: see `store/privacy-practices.txt` for the Chrome Web Store answer.

### Notes for Firefox add-on reviewers

- Model-written JavaScript runs only inside the bundled QuickJS interpreter (WebAssembly), never through `eval`, `new Function`, `<script>` or `tabs.executeScript`. The only CSP keyword beyond `'self'` is `'wasm-unsafe-eval'`, which loads the interpreter.
- The interpreter is the release build of `@jitl/quickjs-ng-wasmfile-release-sync` 0.32.0 from npm: `code-sandbox/quickjs.wasm` is `dist/emscripten-module.wasm` from that package, unchanged; `code-sandbox-worker.js` bundles its JavaScript glue with `quickjs-emscripten-core` 0.32.0 and `src/shared/code-sandbox/engine.ts`.
- The code has no network access, no WebExtension APIs and no access to web pages; it only receives the text the agent passes in and returns text. On Firefox 154+ it also runs inside a sandboxed page (`sandbox.content_security_policy` without `unsafe-eval`, `default-src 'none'`). That page runs only the extension's own scripts and the interpreter, never the model's code as JavaScript, so it does not expose the extension to fingerprinting by untrusted scripts. Its `worker-src blob:` is needed because a page with an opaque origin cannot start a Worker from a `moz-extension:` URL; the `blob:` Worker is made from the packaged `code-sandbox-worker.js`, which the background page reads and hands over.

## Firefox Data Collection Declaration

For Firefox builds, the manifest declares required data collection permissions under `browser_specific_settings.gecko.data_collection_permissions`.

The current required declaration is intentionally conservative because OpenBrowserAgent can transmit user-selected browser context and messages to user-configured providers, search engines, and MCP servers:

- `browsingActivity`: tab URLs, titles, and browser task context may be included in model/tool requests.
- `searchTerms`: the web search tool runs searches through the browser's configured default search engine in a background tab and reads the results.
- `websiteContent`: attached pages, selected elements, extracted text, images, and tool results may be sent to configured providers or MCP servers, and the text of pages the user translates is sent to the translation engine they selected.
- `websiteActivity`: browser automation tools can navigate tabs, read pages, and interact with page state when the selected agent has those tool groups.

## Data Sent to Model Providers

### Permission before content is sent

A provider whose endpoint is on another server receives nothing until the user agrees, for that provider, that their content is sent to the endpoint's host:

- The provider form (Settings → AI providers & models, which the side panel's setup also opens) shows a required checkbox: "I agree that content I share in chats (messages, page text, screenshots and files) is sent to `<host>`." Without it, the form saves everything but the API key. Once saved, the form shows "Allowed to receive your content" with the host and a **Withdraw permission** button; providers without permission show a "Needs permission" badge.
- The host comes from the provider's base URL, or the provider type's default endpoint (for Gemini, `generativelanguage.googleapis.com`). It includes a non-default port. Changing the base URL to another host or port asks again.
- The permission is stored with the provider as `consent: { host, grantedAt }` and synced with it, so a provider synced to another device does not ask again. Providers from earlier versions, imported or synced without it, ask before their first use.
- Every model request (chats, sub-agents, the helper model for page extraction and context compaction, chat titles, the smart bar, image generation) gets its endpoint from one resolver, which stops a request to a provider without permission before anything is sent. The side panel asks above the composer before a send that would use such a provider; declining keeps the message in the composer and sends nothing. The smart bar asks in its result card and runs once the user agrees. Context menu actions open the side panel and ask there. A request with no one to ask, such as a sub-agent on another provider, fails with a message saying the provider needs permission.
- Endpoints on this device or the local network need no permission: `localhost` and `*.localhost`, `*.local`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, link-local `169.254.0.0/16`, `0.0.0.0`, and IPv6 `::1`, `::`, unique local `fc00::/7`, link-local `fe80::/10` and IPv4-mapped forms of these.

### What requests include

Depending on user action and the selected agent's tool groups, requests may include:

- User messages.
- Chat history, including the tool calls of earlier turns and their shortened results.
- Selected agent instructions, tool definitions, and (for agents with a workspace) MEMORY.md and USER.md.
- Selected skills.
- Attached tab metadata, URLs, titles, and extracted page text.
- Selected element metadata such as tag name, text, input value, truncated HTML, image URL, and image data URL when captured.
- Uploaded text files as text.
- Uploaded images as image input when read by the agent; other binary files are described by name and size only.
- Tool results and MCP results, including page text and the helper model's requests when it is used for page extraction, sub-agent summaries, or context compaction.
- Generated image prompts and optional reference attachments.

## Page Translation

"Translate this page" in the right-click menu, the translate button on pages or the keyboard shortcut (Alt+A, Control+Shift+A on macOS) translates the page with the engine selected in Settings → On pages → Translate. The page script is injected into that tab only when one of them is used. The tab then stays in translate mode: every later page loaded in it (links, typed addresses, back/forward) is translated too, until the tab is reloaded, "Show original" is clicked or the tab closes; other tabs are not affected. It reads the page's paragraphs and sends them, a few at a time as they come near the screen, to the background, which sends them to the engine:

- **Built-in translator** (default): Chrome's on-device Translator and LanguageDetector APIs. No text leaves the browser. The first translation into a language may download that language pack. Where the background has no Translator API (Firefox, Safari, older Chrome), or the browser can't translate the page's language pair, tell its language or set up its translator, nothing is sent anywhere else: the page shows a note saying the built-in translator can't translate it and to choose another engine in the Page translation settings.
- **AI model**: paragraph text (with numbered markers in place of links, emphasis and code) goes to the configured model provider, with the page title and description, the section headings above each batch, a short piece of the text just before it and what each paragraph is (heading, button, menu item, label or caption), as context for the translation.
- **Google Translate (free)**: paragraph text goes to `https://translate-pa.googleapis.com/v1/translateHtml` with the key of Google's retired website translation widget (a readable constant in `src/background/page-translate/engines/free-config.ts`), or, when that key is refused, to `https://translate.googleapis.com/translate_a/t`.
- **Microsoft Translator (free)**: paragraph text goes to `https://edge.microsoft.com/translate/translatetext`.
- When the selected free engine rate-limits (429, 503 or an HTML page instead of JSON), refuses (401/403), fails, or cannot be reached twice in a row, the rest of that page is translated with the other free engine, and the page shows a note saying so. If that one fails too, translating stops with a note. Choosing Google or Microsoft can therefore send a page's text to both. The built-in translator never hands text to another engine: what it can't translate stays as it is, with a note.

The free engines are unofficial web endpoints, not documented APIs, and can rate-limit or stop working. Requests come from the extension's background with `credentials: "omit"`: they carry no page address, cookies or account data. Rate limits and refusals are reported on the page. Host access for these calls comes from `<all_urls>`; the services also allow cross-origin requests.

### Translate button and shortcut

The translate button's script (`content-scripts/page-translate-button.js`) is registered on http(s) pages, in the top frame only, while Settings → On pages → Translate → "Translate button on pages" is on (the default), except on the sites it is hidden on. It reads nothing from the page: it draws a small button in a closed shadow root on an edge of the window and, on a trusted click, asks the background to translate the page or show the original, the same as the menu item. Where the user drags it is stored on this device only (`chrome.storage.local`), as an edge and a fraction along it, the same for every site; the sites it is hidden on are part of the synced settings. The keyboard shortcut is a browser command (`commands` in the manifest, no extra permission); it does nothing while its switch in Settings → General → Keyboard shortcuts is off.

### Video subtitles

Settings → On pages → Translate → "Translate video subtitles automatically" (off by default) translates the subtitles of every video that has them, on every site, with the same engine and cache as page translation. While it is off, nothing starts on its own: "Translate subtitles" in a video's right-click menu starts or stops one video's subtitles, and "Translate this page" also starts them for the page's videos; the subtitle script (`content-scripts/video-subtitles.js`) is injected into the video's frame only then.

While the switch is on, two scripts are registered on http(s) pages, in every frame (including frames from other sites, and frames without their own origin such as `about:blank`, where the browser supports it), to run before the page's own scripts (`document_start`), so the first caption file a player loads is seen:

- the subtitle script, in the extension's isolated world. On a page without a video it only listens: for the browser's media events, the right-click on a video (to know which one the menu means) and the caption observer's event. When a video shows at a usable size it asks the background whether the switch is on and starts that video's subtitles; they show nothing and translate nothing until the video has captions. The right-click menu turns one video's subtitles off or on again for this page load. No note shows for videos without captions;
- the caption observer (`content-scripts/caption-observer.js`), in the page's own world (`world: "MAIN"`). It wraps `fetch` and `XMLHttpRequest`. While the page has no `<video>` it looks at nothing; otherwise it reads a response only when its content type names a caption format or its URL looks like a caption file, and at most 5,000,000 characters of it. A response of a type that names no format (`application/octet-stream`, as many file servers send caption files) is read only as far as its first bytes, and on only when they start like a caption file. Media, images, fonts, streaming manifests and larger responses are never read. Thumbnail tracks (WebVTT files of preview pictures) aren't passed on. It keeps nothing.

Turning the switch off unregisters both; open pages stop the subtitles that started by themselves. An observer already in a page stays there until the page reloads; what it passes on is then only used for subtitles the user starts. When the switch is off and the user starts subtitles, the same observer is injected into the video's frame then (`scripting.executeScript`).

Subtitles are read, in order of preference, from the video's own text tracks, from caption files the page loads (WebVTT, SRT, TTML, json3, recognized by content), or from captions the player draws as page text. The observer passes caption files to the subtitle script with a DOM event; the page's resource timing names caption files loaded before, which are fetched again from the page. The page can see and fire that event, so what it passes is parsed and size-checked as data and can't start a translation by itself; with the switch on, a page that shows a video with captions (its own, or ones it fires) gets them translated, as any captioned video does. Lines are translated from just behind the playhead to two minutes ahead of it, never the whole video at once. Nothing leaves the device except the caption lines sent to the chosen translation engine, as for page text. The AI model gets the video page's title and the two lines said before each batch as context.

Translations are cached locally in IndexedDB (keyed by a hash of the engine, model, target language and text) for 30 days; Settings → On pages → Translate → Advanced clears them. Settings stay in the synced preferences like other preferences.

## External Network Calls

OpenBrowserAgent sends data to endpoints configured by the user in the AI providers and MCP servers settings. It can also make these external calls:

- Provider APIs for chat, responses, image generation, and model fetching.
- Ollama local endpoints when configured.
- MCP Streamable HTTP server URLs configured by the user.
- Assistant link preview fetches with `credentials: "omit"`.
- Image URLs from an answer, only after the user chooses to load them.
- Page image/file download URLs when a download tool is used.
- WebDAV URLs configured as a sync backend (see [Sync](sync.md)), including chat attachments when chats and files sync.
- The free Google or Microsoft translation endpoints, only when the user selected one of them and translates a page (the other one only when the selected one fails on that page) (see [Page Translation](#page-translation)).

Mermaid diagrams are drawn locally by the bundled `mermaid` package; no diagram source leaves the device.

## Storage and Sync

Stored data includes:

- Preferences and UI language.
- Provider configs, including API keys, base URLs, and the user's permission to send content to the endpoint's host.
- Agents and agent workspaces.
- Skills and skill files, including recorded skills (instructions and recorded steps, never typed values).
- Recordings in progress and how check runs of recorded skills went (session storage, gone when the browser closes).
- MCP server definitions and headers.
- Local execution bridge configurations and secrets.
- Chats and chat tabs. A chat keeps, for each tool call, the text the model received (page snapshots and extracted text included, up to the tool output size limit), so later turns and chat exports can show what the agent saw. Longer outputs are also kept in local IndexedDB under artifact handles; those are never synced.
- Page translations (IndexedDB, 30 days).
- Sync status and sync bookkeeping: what this device last synced, changes waiting to upload, a copy of the last sync root file, and the key derived from the sync passphrase.

Sync is disabled until a backend is selected. Settings then always sync: language, preferences, AI providers and MCP servers without their keys, agents with their `MEMORY.md` and `USER.md`, and skills without their files. Keys (API keys and MCP request headers) sync only when the user turns them on and sets a sync passphrase; they are encrypted on the device with a key derived from it, so the sync storage never sees them in the clear. Chats sync only when turned on; files (skill and workspace files, chat attachments) only on WebDAV and when turned on. Local execution bridges never sync.

Attachments are saved on this device first and uploaded by the next sync. Attachments and chats synced from another device are downloaded when they are first shown here.

How sync works, what it sends, and how it handles conflicts and deletions is described in [Sync](sync.md).

## Stopping Work

Stop applies to the current chat. Subagent chats run independently and can be stopped individually. Closing a parent first asks the background to cancel the parent and linked child chat IDs, including retained runs that this panel has not visited since reload, and waits for acknowledgment before removing those chats. If cancellation cannot be acknowledged, the chats remain. Canceling a wait for a subagent result does not itself stop the child.

Cancellation propagates to owned requests that accept an abort signal. It cannot undo committed remote writes or browser actions already dispatched. Sync runs in the background on its own schedule; stopping a chat does not stop a sync round.

## Safe Use

- Broad permissions are necessary for cross-site browser assistance, but they increase responsibility for careful use.
- Attached pages and selected elements may contain sensitive information.
- Browser automation tools can navigate, click, type, close tabs, download files, interact with dialogs, and modify page state.
- Debugger-powered tools (page JavaScript, diagnostics) are available only when the selected agent has those tool groups.
- MCP tools send arguments and context to configured MCP servers.
- Tool results and page content may be truncated by size limits.
