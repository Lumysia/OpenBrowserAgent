# Permissions and Privacy

OpenBrowserAgent is powerful because it can read browser context, automate pages, and send selected context to user-configured AI providers. This page documents what permissions are used for and what data can flow through the extension.

## Browser Permissions

Permissions differ by browser target.

All builds declare:

- `scripting`: inject scripts/CSS for page text extraction, element selection, DOM interaction, input, scrolling, and content capture.
- `tabs`: read tab metadata, list tabs, open/close/reload/navigate tabs (in the background; a tab is brought to the front only when the user asks), and attach tab context to chats.
- `webNavigation`: tell which tabs a page the agent works on opened (a link with a target, `window.open`), so the user's own tab goes back in front of them. Only the opener of new tabs is read during an `act` call; nothing is stored.
- `storage`: persist settings, providers, agents, skills, MCP servers, chats, workspaces, language, and sync status.
- `unlimitedStorage`: allow local chat and attachment storage to grow beyond normal extension storage quotas; browser-sync quotas still apply.
- `alarms`: check for sync changes once a minute while an extension page is visible.
- `declarativeNetRequestWithHostAccess`: remove the `Origin` header from the extension's own requests to MCP servers that have **Send without browser Origin** turned on (see [MCP servers](product-overview.md#mcp-servers)). Each rule matches only that server's exact URL and requests this extension makes; other requests and pages are untouched.
- `contextMenus`: the OpenBrowserAgent submenu in the right-click menu (ask about or summarize the page, translate the page, search the web, summarize a linked page, copy the page as Markdown). It can be turned off in Settings → Context menu. Safari shows it on macOS only.
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

Firefox and Safari omit the Chrome-only `tabGroups`, `sidePanel` and `debugger` permissions. Firefox captures a background tab with `tabs.captureTab`; Safari can capture only the tab in front, so a screenshot shows the tab for a moment and then puts the user's tab back. Firefox uses `sidebar_action` for its sidebar. Safari also omits `search` and `nativeMessaging`; its action opens or focuses `sidepanel.html` as an extension tab.

Chrome and Firefox builds also declare one sandboxed page, `code-sandbox.html` (`sandbox.pages`), with its own CSP: `sandbox allow-scripts; default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:` (no `unsafe-eval`, no network). See [Code sandbox](#code-sandbox).

The extension page CSP allows images from `self`, `data:`, `blob:`, `http:`, and `https:` so rendered Markdown images, generated images, and Mermaid previews can display. Images that an answer links from other sites do not load on their own: the answer shows a placeholder, and the image is fetched only after the user chooses Load image (or opens it in a tab). A prompt-injected page therefore cannot leak data through an image URL. Images the extension made itself (`data:` and `blob:` URLs) still show directly.

## Code sandbox

The on-demand `runCode` tool lets the agent run JavaScript it writes, for exact calculations, parsing CSV or JSON and reshaping data. The code runs on the user's device and never in the extension's own JavaScript engine:

- **Interpreter.** QuickJS-ng compiled to WebAssembly (`quickjs-emscripten-core` with the `@jitl/quickjs-ng-wasmfile-release-sync` variant, MIT). The `.wasm` file ships in the package (`code-sandbox/quickjs.wasm`) and is never fetched from a server; nothing uses `eval` or `new Function`. The code sees only what the tool defines: captured `console` output, `input` (a JSON value the agent passes), `readFile` for the workspace files the call lists, and `writeFile`. There is no `fetch`, DOM, timers, `chrome`/`browser` APIs or module loading.
- **Worker.** Each call starts a new Worker that is terminated when the call ends, so nothing carries over between calls.
- **Sandboxed page.** On Chrome the Worker is created inside `code-sandbox.html`, a sandboxed page with an opaque origin and no extension APIs, embedded in the offscreen document. Its CSP has `default-src 'none'`, so neither the page nor its `blob:` Worker can make network requests. The embedding page sends it the Worker's source and the interpreter; results come back over a `MessageChannel`. Firefox 154 and later host the same page in the background page. Safari has no sandboxed pages, and Firefox before 154 ignores the key (the page then reports that it is not isolated and is not used): there the Worker runs from the background page and the interpreter is the boundary.
- **Limits.** 10 s by default and at most 30 s (an interrupt stops the code at the deadline; if it does not stop, the Worker is terminated 2 s later), 128 MB of interpreter memory, a 256 KB interpreter stack, and 1,000,000 characters of output and of written files per call. The model sees the usual tool output cap; longer output is kept as a stored output it can read in ranges.
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

- The provider form (Settings → AI providers, which the side panel's setup also opens) shows a required checkbox: "I agree that content I share in chats (messages, page text, screenshots and files) is sent to `<host>`." A provider that needs it cannot be saved without it. Once saved, the form shows "Allowed to receive your content" with the host and a **Withdraw permission** button; providers without permission show a "Needs permission" badge.
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

"Translate this page" in the right-click menu translates the page with the engine selected in Settings → Page translation. The page script is injected into that tab only when the item is clicked. It reads the page's paragraphs and sends them, a few at a time as they come near the screen, to the background, which sends them to the engine:

- **AI model** (default): paragraph text (with numbered markers in place of links, emphasis and code) and the page title go to the configured model provider.
- **Built-in translator**: Chrome's on-device Translator and LanguageDetector APIs. No text leaves the browser. The first translation into a language may download that language pack.
- **Google Translate (free)**: paragraph text goes to `https://translate-pa.googleapis.com/v1/translateHtml` with the key of Google's retired website translation widget (a readable constant in `src/background/page-translate/engines/free-config.ts`), or, when that key is refused, to `https://translate.googleapis.com/translate_a/t`.
- **Microsoft Translator (free)**: paragraph text goes to `https://edge.microsoft.com/translate/translatetext`.
- When the selected free engine rate-limits (429, 503 or an HTML page instead of JSON), refuses (401/403), fails, or cannot be reached twice in a row, the rest of that page is translated with the other free engine, and the page shows a note saying so. If that one fails too, translating stops with a note. Choosing Google or Microsoft can therefore send a page's text to both.

The free engines are unofficial web endpoints, not documented APIs, and can rate-limit or stop working. Requests come from the extension's background with `credentials: "omit"`: they carry no page address, cookies or account data. Rate limits and refusals are reported on the page. Host access for these calls comes from `<all_urls>`; the services also allow cross-origin requests.

Translations are cached locally in IndexedDB (keyed by a hash of the engine, model, target language and text) for 30 days; Settings → Page translation clears them. Settings stay in the synced preferences like other preferences.

## External Network Calls

OpenBrowserAgent sends data to endpoints configured by the user in the AI providers and MCP servers settings. It can also make these external calls:

- Provider APIs for chat, responses, image generation, and model fetching.
- Ollama local endpoints when configured.
- MCP Streamable HTTP server URLs configured by the user.
- Assistant link preview fetches with `credentials: "omit"`.
- Mermaid preview image URLs through `mermaid.ink` and links to `mermaid.live`.
- Image URLs from an answer, only after the user chooses to load them.
- Page image/file download URLs when a download tool is used.
- WebDAV URLs configured as a sync backend (see [Sync](sync.md)), including chat attachments when attachment sync is enabled.
- The free Google or Microsoft translation endpoints, only when the user selected one of them and translates a page (the other one only when the selected one fails on that page) (see [Page Translation](#page-translation)).

## Storage and Sync

Stored data includes:

- Preferences and UI language.
- Provider configs, including API keys, base URLs, and the user's permission to send content to the endpoint's host.
- Agents and agent workspaces.
- Skills and skill files.
- MCP server definitions and headers.
- Local execution bridge configurations and secrets.
- Chats and chat tabs. A chat keeps, for each tool call, the text the model received (page snapshots and extracted text included, up to the tool output size limit), so later turns and chat exports can show what the agent saw. Longer outputs are also kept in local IndexedDB under artifact handles; those are never synced.
- Page translations (IndexedDB, 30 days).
- Sync status and sync bookkeeping: what this device last synced, changes waiting to upload, and a copy of the last sync root file.

Sync is disabled until a backend is selected. Language and lightweight preferences then use that backend. The provider sync option is enabled by default. Agents, skills, MCP servers, local execution bridges, chats, and chat attachments remain local unless the user enables their sync options.

Important: provider sync is enabled by default, so provider configurations may sync through browser sync. Users should treat synced provider API keys as sensitive browser-synced data.

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
