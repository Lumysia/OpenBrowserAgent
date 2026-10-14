# Permissions and Privacy

OpenBrowserAgent is powerful because it can read browser context, automate pages, and send selected context to user-configured AI providers. This page documents what permissions are used for and what data can flow through the extension.

## Browser Permissions

Permissions differ by browser target.

All builds declare:

- `scripting`: inject scripts/CSS for page text extraction, element selection, DOM interaction, input, scrolling, and content capture.
- `tabs`: read tab metadata, list tabs, focus tabs, open/close/reload/navigate tabs, and attach tab context to chats.
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
- `debugger`: real mouse and keyboard input where pages ignore synthetic events (rich text editors, `trusted` or coordinate `act` steps), answering a JavaScript dialog that opened outside an `act` batch, full-page screenshots, page JavaScript (`runScript`, off by default), and developer diagnostics (network resources, device emulation). The debugger attaches only for those calls.

Chromium and Firefox additionally declare:

- `search`: run web searches through the browser's configured default search engine.
- `nativeMessaging`: connect to a separately installed local execution bridge, which can execute shell commands when enabled for the active agent.

Firefox and Safari omit the Chrome-only `tabGroups`, `sidePanel` and `debugger` permissions. Firefox uses `sidebar_action` for its sidebar. Safari also omits `search` and `nativeMessaging`; its action opens or focuses `sidepanel.html` as an extension tab.

The extension page CSP allows images from `self`, `data:`, `blob:`, `http:`, and `https:` so rendered Markdown images, generated images, and Mermaid previews can display. Images that an answer links from other sites do not load on their own: the answer shows a placeholder, and the image is fetched only after the user chooses Load image (or opens it in a tab). A prompt-injected page therefore cannot leak data through an image URL. Images the extension made itself (`data:` and `blob:` URLs) still show directly.

## Firefox Data Collection Declaration

For Firefox builds, the manifest declares required data collection permissions under `browser_specific_settings.gecko.data_collection_permissions`.

The current required declaration is intentionally conservative because OpenBrowserAgent can transmit user-selected browser context and messages to user-configured providers, search engines, and MCP servers:

- `browsingActivity`: tab URLs, titles, and browser task context may be included in model/tool requests.
- `searchTerms`: the web search tool runs searches through the browser's configured default search engine in a background tab and reads the results.
- `websiteContent`: attached pages, selected elements, extracted text, images, and tool results may be sent to configured providers or MCP servers, and the text of pages the user translates is sent to the translation engine they selected.
- `websiteActivity`: browser automation tools can navigate tabs, read pages, and interact with page state when the selected agent has those tool groups.

## Data Sent to Model Providers

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

The free engines are unofficial web endpoints, not documented APIs, and can rate-limit or stop working. Requests come from the extension's background with `credentials: "omit"`: they carry no page address, cookies or account data. Rate limits and refusals are reported on the page. Host access for these calls comes from `<all_urls>`; the services also allow cross-origin requests.

Translations are cached locally in IndexedDB (keyed by a hash of the engine, model, target language and text) for 30 days; Settings → Page translation clears them. Settings stay in the synced preferences like other preferences.

## External Network Calls

OpenBrowserAgent sends data to endpoints configured by the user in Providers and MCP settings. It can also make these external calls:

- Provider APIs for chat, responses, image generation, and model fetching.
- Ollama local endpoints when configured.
- MCP Streamable HTTP server URLs configured by the user.
- Assistant link preview fetches with `credentials: "omit"`.
- Mermaid preview image URLs through `mermaid.ink` and links to `mermaid.live`.
- Image URLs from an answer, only after the user chooses to load them.
- Page image/file download URLs when a download tool is used.
- WebDAV URLs configured as a sync backend (see [Sync](sync.md)), including chat attachments when attachment sync is enabled.
- The free Google or Microsoft translation endpoints, only when the user selected that engine and translates a page (see [Page Translation](#page-translation)).

## Storage and Sync

Stored data includes:

- Preferences and UI language.
- Provider configs, including API keys and base URLs.
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
