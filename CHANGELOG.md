# Changelog

What changed in each release. The release workflow publishes the section for the tag's version as the start of the GitHub release notes, followed by the list of merged pull requests.

## Unreleased

- The side panel no longer has the "This page" row; its switches move to the toolbar button's menu.

## 0.2.0-beta.14 - 2026-10-15

- Tooltips close when the pointer moves quickly from the side panel or settings into the web page.

- Image generation: the AI picks the image size for each request; the Image size setting is gone.
- Settings: the sidebar lists every page, with Agents, Skills, Translate, Smart bar, Right-click menu, MCP servers, Local execution bridges and Troubleshooting shown under their group instead of in tabs at the top of the page. Each page now starts with what you change most often and ends with what you set once: Translate starts with the translation engine and display, Smart bar's site lists and Sync's copy/paste code (now under "Sync code") come last. Outline buttons, badges and expand arrows are easier to see.
- After pasting a sync code on the Sync page, the form now just says it connected instead of showing a "Connect and sync" button that did nothing more.
- The keyboard shortcuts list no longer has an on/off switch for "Translate this page or show the original". To turn that shortcut off or change it, use the browser's shortcut settings ("Change shortcuts"), as for the other shortcuts. If you had turned it off with the switch, the shortcut works again until you remove its key there.
- The keyboard shortcuts list (setup's last page and Settings → General) names every shortcut in the extension's language, not the browser's. When opening the side panel has no shortcut, the list says how to pick one (for example Ctrl+Shift+Y).
- **Setup for returning users**: after the language, setup asks whether you've used OpenBrowserAgent before. "I use it on another device" connects sync (paste a sync code, browser account sync, or WebDAV), asks for your sync passphrase if your API keys are encrypted, shows what arrived (AI providers, agents, chats and more) and skips the AI provider and web page steps. Each step goes on by itself once its work is done, and while something runs the Next button says what is happening. If sync can't connect or brings no AI provider, you can try again or set up as a new user. The small sync code link on the AI provider step is gone.
- "Open side panel" at the end of setup now closes the setup tab, and a setup started with "Run setup again" goes back to your Settings tab.

## 0.2.0-beta.13 - 2026-10-15

- **Guided setup**: installing OpenBrowserAgent opens a setup with one thing per step and Back / Next: your languages (the extension's and "Translate into"), an AI provider (with "Test connection" and a model to pick, or a sync code from another device), what to add to web pages (translate button, smart bar on selected text, video subtitles), and a last page with your keyboard shortcuts and "Open side panel". Every step can be skipped.
- Until setup is finished (its last page reached, or an AI provider with a model set up, also through sync), the side panel doesn't open: the toolbar button, its shortcut and the "Ask" items in the right-click menu and the smart bar open the setup where you left off instead. The side panel's setup card is gone; with no AI provider later on, the side panel shows a single "Add AI provider" link.
- Settings → General has "Run setup again", which opens the setup at its first step.
- Page translation no longer skips paragraphs in Japanese and other languages written without spaces when they contain a number: such paragraphs were taken for a number and left untranslated.
- The translate button on the page edge no longer flickers in and out when the pointer rests against the side of the screen; it now stays out until the pointer leaves it.
- An AI provider of the "(or compatible)" kinds (OpenAI, OpenAI Responses, Anthropic, Ollama) asks for its Base URL first, next to the API key, instead of under "Advanced": that's where you say which server you use. Named services such as DeepSeek or OpenRouter keep their Base URL under "Advanced".

## 0.2.0-beta.12 - 2026-10-15

- **Keyboard shortcut for the side panel**: Ctrl+Shift+Y (Command+Shift+Y on macOS) opens the side panel. The key suggested before was one the browser keeps for itself, so the side panel had no shortcut. If the key isn't set after the update, or another extension has it, pick one in the browser's shortcut settings.
- **One "Translate into" language**: Translate in the smart bar and its dictionary entries now use the same language as page translation and video subtitles (Settings → Page translation → "Translate into"), instead of the extension's language. Nothing changes while "Translate into" is left at the extension's language.
- The translate button on pages now only shows on pages that aren't already in your "Translate into" language (judged from the language the page declares and, where the browser can tell, from its text). On a page it can't tell, it still shows. The keyboard shortcut and the right-click menu still translate any page, and the button comes back on a translated page to show the original.
- **Right-click the toolbar button** for the current page: translate it or show the original, pick the "Translate into" language, turn the translate button or the smart bar on or off for the site, and turn translated subtitles on or off when the page has a video. Clicking the button still opens the side panel.
- **"This page" in the side panel**: a small line under the top bar with the same switches for the page you're on: translate it, the translate button and the smart bar on this site, and translated subtitles when the page has a video. Collapse it with "This page".
- The right-click menu on selected text names it: "Ask about “…”", "Translate “…”" and "Search the web for “…”". "Translate “…”" shows the smart bar's translation (or dictionary entry) right there, also when the smart bar is turned off. "Summarize this page" and "Copy as Markdown" no longer show on a selection, and "Ask or act on this page" is now "Ask about this page".
- Adding a recommended MCP server tests it and turns it on in one step; if the test fails it stays off with the reason shown.
- Settings → Local execution bridges shows the installer command with this extension's ID already in it. Paste what the installer prints, and the bridge is added (or updated) and tested; no more copying the host name, shell config ID and secret by hand.
- A video's right-click item reads "Hide translated subtitles" while its subtitles are translated.
- With the smart bar set to "Only with the shortcut", its settings show the current key (or that none is set) and a "Change shortcut" button.
- The sync button in the side panel's header shows only while sync is on, and the smart bar's settings show only the site list its mode uses (blocked or allowed sites); the other list keeps its sites.
- **Settings in six pages instead of eleven**: General, AI providers & models, Agents & skills, On pages (Translate, Smart bar, Right-click menu), Sync, and Advanced (MCP servers, local execution bridges, and Troubleshooting, formerly Debug). Links and bookmarks to the old pages open the right tab. General now starts with the "Translate into" language and lists every keyboard shortcut with one "Change shortcuts" button (the page translation shortcut's switch moved there); chat options such as auto scroll and max tool steps are folded under "Chat behavior". One Models table picks the model for chat, helper tasks, the smart bar, page translation and images; each uses the chat's model until you pick another, images included. Rarely changed options (image size, translating menus and buttons, saved translations) are under "Advanced".
- "Clear all chats" asks first and says that pinned chats are deleted too, and deleting an agent asks first and says its workspace goes with it. A new agent or skill opens right away. The "New Chat" button above the message box is gone (the one in the header stays), and "Add new tab" in the "+" menu is now "Add open tabs…".
- **Simpler AI providers**: DeepSeek, OpenRouter, Z.ai, AIHubMix, Vercel AI Gateway and Minimax can be added straight from the list, and the kinds of service have plainer names ("OpenAI (or compatible)", "Anthropic (or compatible)", "Google Gemini", "Ollama (local)"). The OpenAI Responses API is now an "API style" of an OpenAI provider. Base URL, thinking switch and a model's context length are under "Advanced". Provider changes save as you make them, with no Save button; the API key is saved once you allow sending content to the provider.
- **Synced API keys ask for the passphrase**: on a device that joins sync (with a sync code or by hand) while your API keys sync encrypted, you're asked for your sync passphrase right after connecting, with "Skip for now"; a wrong one says so. Until it's entered, the side panel shows "Your API keys are synced but locked" with a field to enter it, and a chat that needs a locked key says so instead of failing with "401". The passphrase field is also at the top of the Sync page.
- **Simpler Sync page**: one choice, "Off / Browser account / WebDAV", instead of two switches; the WebDAV fields show only when you choose it, and it starts syncing once the server answers. "What syncs" shows once below the choice while sync is on, with what the chosen backend can't hold marked. You can now paste a sync code from another device on the Sync page too (its sync choices replace this device's), and "Copy sync code for another device" sits at the top of the page while you sync with WebDAV.
- **Setup on install**: installing OpenBrowserAgent opens a setup page where you add an AI provider first. The side panel's setup card is shorter too: add an AI provider, or follow "Already use OpenBrowserAgent on another device? Paste a sync code". The language step (the interface already follows your browser's language) and the "Send your first task" step are gone.
- Live chat and bullet comments flying over a video are no longer translated as its subtitles. Subtitles that start by themselves now only use the subtitles a video or its player provides; for captions a player only draws on the video, start them from "Translate subtitles" in the video's right-click menu.

## 0.2.0-beta.11 - 2026-10-15

- **Translate video subtitles everywhere**: turn on "Translate video subtitles" in Settings → Page translation, and every video with subtitles shows each line with its translation under it by itself, on any site, including the first captions a player loads (no need to turn the player's captions off and on again). "Translate subtitles" in a video's right-click menu turns them off or on for that video. The switch is off by default; while it is off, the menu and "Translate this page" translate subtitles as before.
- The small subtitle button on the corner of videos is gone, with its setting; the switch above and the right-click menu replace it.
- Translated subtitles stay over the video when the window or the player changes size, also while the video is paused, and move with it when you scroll instead of catching up a moment later; before, they could hang past the player's edge or below it. They are also smaller, with the original line a little smaller than its translation.
- Subtitles of players embedded from another site, and of caption files a site serves as plain files (without saying they are subtitles), are translated too. A player's preview pictures over the seek bar and annotations such as a site's watermark are no longer taken for subtitle lines; ruby readings over words are left out of the line.
- Page translation translates more of the page's content: questions and sentences in buttons, tabs and quiz choices, dialogs (also cookie and sign-in prompts), headings and text in a page's header and footer, tables of contents, columns fixed beside the article, link titles written in title case, titles with a number such as "Ep 12: The End", boxed lists of headlines, and carousel slides once they show. A button inside a sentence stays in it, so the sentence is translated whole. Short labels such as menu items, "Log in" and "Accept", names, dates and prices still stay as they are unless you turn on translating menus and buttons.
- A question the assistant asks in the side panel can always be answered while it waits, also after a step that failed; writing in the message box instead sends your message as the reply. A question nothing waits for any more (the response was stopped or ended) shows as not answered, instead of "Asking a question" with options you couldn't click.

## 0.2.0-beta.10 - 2026-10-15

- **Translate button on pages**: a small button on the edge of web pages translates the page or shows the original. Drag it to any edge of the window; it stays where you put it on every site. Point at it to hide it on that site or everywhere; Settings → Page translation lists the sites it is hidden on.
- **Keyboard shortcut for page translation**: Alt+A (Control+Shift+A on macOS) translates the page or shows the original. Change it in the browser's shortcut settings, or turn it off in Settings → Page translation.
- Translate in the smart bar now writes a word's dictionary entry in your language every time (in English when the word is already in your language); before, the first try often came back in the page's language.
- Removed the "Diagnostic logging" switch in Settings → Debug: it no longer did anything. Its stored setting is cleared on update.
- Links you open in a new tab from a translated page are translated too, like the next pages in the same tab.
- The browser's built-in translator leaves text that is already in your language as it is, also on pages that mix languages (such as a feed with posts in several languages); before, it could garble it.
- With the browser's built-in translator, short titles such as a name with a version number are translated like the rest of the page. Before, one it took for another language could stop it from translating the page and hand it to the AI model, or leave the titles and the cards after them untranslated. A text in a language it can't translate no longer takes the texts around it down with it.
- A teaser that ends in a "Read more" the page sets on a line of its own gets its translation right under the teaser, and "Read more" its own; before, the translation came after "Read more" and repeated it.
- Page translation translates buttons that hold the page's content, such as the questions of an FAQ and the titles of sections that open and close, with the translation under the title inside the button. Short buttons such as "Log in" still stay as they are unless you turn on translating menus and buttons.
- An MCP server or bridge test error saved by an earlier version no longer repeats "Server test failed" or "Bridge test failed" in front of the reason.
- Skills you picked are highlighted in the skill list, like the chosen model and agent.
- When a page the agent works on opens a new tab, your tab now always comes back to the front; before, it sometimes stayed on the new tab.
- A download's progress in the side panel shows its percentage the way the extension's language writes it (such as "42 %" in German and French).
- A model that refused images or mid-chat tool updates once is sent requests without them from the start in later chats, instead of failing first each time; editing the model in Settings lets it try again.
- Loading the model list of an Anthropic or Gemini provider now shows all of its models, not only the first page.

## 0.2.0-beta.9 - 2026-10-14

- **Translated video subtitles**: choose "Translate subtitles" in a video's right-click menu or press the small button on its corner, and its subtitles show the original line with its translation under it, also in fullscreen; "Translate this page" translates the subtitles of the page's videos too. It works with the video's own subtitle tracks, the caption files a player loads and captions a player draws on the video, on any site.
- **Sync in groups**: settings always sync, including AI providers, agents (with their `MEMORY.md` and `USER.md`), MCP servers and skills. Keys, chats and files each have one switch. Files (skill files, other workspace files, chat attachments) sync on WebDAV only; where they don't sync, agents and skills say so instead of looking empty. Local execution bridges no longer sync.
- **Encrypted API keys**: API keys and MCP request headers sync only when you turn on keys and set a sync passphrase. They are encrypted on your device; every other device asks for the passphrase once.
- **Set sync up again after updating**: the sync format changed. The first sync replaces the old data on the server with this device's; check the Sync page to turn keys, chats and files on again. Your data on each device stays as it is. Update all devices: older versions stop syncing with the new format.
- **Recovery from a broken sync file**: if an upload stops halfway and leaves the server's sync file empty or damaged, the next sync rebuilds it from the previous copy and your devices' data, and shows a note, instead of failing every time. Two devices saving at the same moment on a server that locks files during uploads (such as Koofr) no longer fail with "Locked".
- Skills are limited to 96,000 characters of files, like an agent's workspace.
- The side panel has one background from top to bottom; the line and the separate band behind the message box are gone.
- The send button no longer flickers when the pointer moves over it.
- After "Translate this page", the next pages you open in the same tab are translated too, on any site, until you reload the tab or choose "Show original".
- **Page translation uses the browser's on-device translator by default**: it is fast and keeps the text on your device. Where the browser has none (Firefox, Safari, older Chrome) or can't translate a page's language, the page is translated with your AI model instead and a note says so. If you have changed settings before, your page translation engine may stay as it was; choose "Built-in translator" in Settings → Page translation to use it.
- A response that ends early now says so under it: cut off at the model's output limit, stopped, or the error it ended with (shown once, no longer next to a second copy of the response), with a Continue button on the latest one. The chat export includes how each response ended, the model is told when an earlier response was cut off, stopped responses keep their token usage, and model calls no longer count the earlier messages of the chat. Models Pi knows get their full output limit.
- Page translation covers more of the page: with the browser's built-in translator, a text it refuses no longer leaves the rest of its group untranslated (such as a list of links under a heading); headings and paragraphs on sites with tightly set type show their translation under them instead of only on hover; headings that animate word by word are translated once, not twice; and headings and paragraphs that some sites wrap in layout-less elements are no longer skipped.
- Local commands run for as long as the execution bridge's timeout says (2 minutes unless you change it, at most 30), and the agent is told that same limit; before, the agent was told 10 minutes while the bridge stopped commands earlier. Update the bridge (`npx openbrowseragent-local-execution-bridge@1 update`) so a failed bridge test names the exact setup step to fix.
- The extension starts in your browser's language when it supports it: a browser set to French, German, Japanese, Spanish, Portuguese, Korean or Chinese (Hong Kong, Macao, Singapore) no longer gets English, and the settings show the language in use.
- **Recommended MCP servers**: the keyless search servers (Exa, Parallel, TinyFish, Firecrawl) are now a list of recommended servers that you add with one click, instead of being in every list. The ones you already have stay, and every MCP server can now be deleted; a deleted recommended server is offered again.
- Sources from MCP tools work with any server: they come from the links a server marks as results (resource links, structured results, or a link on its own line) instead of one search server's text format.
- Saving a page's images finds CSS background images on any element (not only common containers) and takes the image the browser chose from `srcset`; images keep their real file extension.
- Files of any text type (code, logs, `+json`/`+xml` formats) are read and attached as text.
- Bridge test errors the extension knows (bridge not found, no host name, no answer in time) are shown in your language.
- Page translation with your AI model reads each part of the page in context: the model is told the page's description, the section heading above the text, the sentence just before it and whether a text is a heading, button, menu item, label or caption. Short labels and buttons come out shorter and more natural, and smaller models translate more cleanly (fewer untranslated or repeated originals). Translations cached by earlier versions are made again once.
- Model names containing “/” (such as OpenRouter’s `vendor/model`) show whole in the model menus, every model picker in Settings shows models the same way, and the model named under an answer is the one that actually answered.
- “Reset built-ins” and “Reset defaults” on the Agents page ask for confirmation first, like deleting a skill.
- "Fetch models" in Settings asks for permission to send to a provider's server first, like "Test model", since the request carries your API key. Gemini's key is sent in a header instead of the address.
- Settings and the side panel tell the browser their language, so screen readers and hyphenation follow the UI language.
- Sync backends on the Sync page show the name you gave a WebDAV backend and a line on what each kind of sync is, instead of the same title twice. First-run setup names the WebDAV option in your language and saves the server details only when you connect.
- Settings text fields for agents, MCP servers and local execution bridges save when you leave the field instead of on every keystroke, and deleting an MCP server or bridge asks first. Test errors and import errors show in your UI language, also after you change it.
- “Test model” in AI provider settings sends its request the same way chats do (so it checks the connection chats actually use), asks for permission like other requests, and shows a check mark when it passes.
- Mermaid diagrams in answers are drawn in the side panel instead of by mermaid.ink, so diagram text no longer leaves your device; they follow the theme, and a diagram that can't be drawn shows its source.

## 0.2.0-beta.8 - 2026-10-14

An eighth pre-release of 0.2.0.

- **Faster dictionary, smart bar and page translation with thinking models**: quick requests ask for the least thinking the model supports (taken from the model catalog, or a new per-provider "thinking switch" for OpenAI-compatible servers). If a model still thinks, the smart bar says "Thinking…" instead of staying blank. On a local server, page translation sends one batch at a time and smart bar requests go first.
- **Run code**: the agent can run JavaScript in a sandbox (QuickJS) to compute, parse CSV or JSON and transform data. The sandbox has no network, no page access and no extension APIs, with time, memory and output limits.
- **Page translation and the smart bar follow general rules only**: code views, cookie notices, icons, rich editors and labels are recognised from page structure rather than from particular websites' names, and rules no longer assume English text. The smart bar is no longer blocked on one site by default; it simply stays hidden when nothing on the page can be selected.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.7 - 2026-10-14

A seventh pre-release of 0.2.0.

- **Page translation that keeps the page tidy**: menus, tabs, buttons, dates, names and icons stay as they are; each translation goes where it reads well (under the paragraph, after a short label, or on hover only where showing it would break the layout); news headlines show their translation under them; translations line up with the original and use its font. "Translation only" swaps the text in place. On-screen text is translated first, and the AI model keeps names consistent across a page. A first click on "Translate this page" now always starts.
- **The agent stays on its own tab**: what it opens and works in doesn't take over the tab you are reading.
- **Ask before sending to a remote AI provider**: the first time content goes to a provider's server, you are asked once per address (local and LAN addresses never ask); you can withdraw it in Settings.
- **Calmer auto-scroll**: scrolling up a little while an answer streams stops following, and the end of the answer no longer pulls you down.
- **Clearer names**: "AI provider" throughout, and every API type reads "…-compatible" (Gemini, Ollama, OpenAI Responses too). The sync section now says which settings always sync.
- Page notes such as "Copied as Markdown" use the extension's own look.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.6 - 2026-10-14

A sixth pre-release of 0.2.0.

- **Translate whole pages**: "Translate this page" in the right-click menu shows the translation under each paragraph (or only the translation) and "Show original" restores the page. Engines: your AI model, Chrome's built-in translator, or Google or Microsoft (free). Settings → Page translation.
- **Downloads**: the agent can download files (also ones that need you to be logged in), save what it made to your device, wait for a download a click starts, and tells you where each file is. Each file has a "show in folder" button.
- **Everything in your language**: tool steps read as plain summaries ("typed 2 fields, clicked 1"); errors, sizes, counts, dates and default names follow the interface language.
- **Clearer tool results for the agent**: it reads long pages with extract instead of twice, cites sources by the right ids, and gets exact counts and receipts from find, workspace, skills and devtools.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.5 - 2026-10-14

A fifth pre-release of 0.2.0.

- A right-click menu: ask about or act on the page, summarize it, search the web about it or about the selected text, summarize a linked page, or copy the page as Markdown. Each item can be turned off in Settings → Right-click menu.
- The smart bar's Summarize is replaced by AI search, which asks the agent in the side panel to search the web about the selection.
- Text sent to the side panel from a selection shows as a card next to the page, not as a quote in the message box.
- Read aloud reads each part in its own language, with a matching voice.
- Interface text can no longer be selected by accident; messages and other content still can.
- The smart bar's close menu no longer highlights its first item when opened with the pointer.
- Theme flag swatches show their tooltip on hover again.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.4 - 2026-10-14

A fourth pre-release of 0.2.0.

- Smart bar icons no longer jump by a pixel when the bar opens under the pointer. They still highlight on hover.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.3 - 2026-10-14

A third pre-release of 0.2.0.

- **Dictionary on Translate**: translating a single word or a short phrase now shows a dictionary entry instead of a one-line translation. It has the pronunciation, part of speech, the meaning on this page first, other meanings, examples with translations, and synonyms or collocations. It works in every UI language and uses the model you already set for the smart bar. Explain and longer selections are unchanged.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.2 - 2026-10-13

A second pre-release of 0.2.0.

- Holiday badges and confetti now follow your theme color instead of using the same color in every theme.
- Built-in MCP servers (Exa, Parallel, TinyFish, Firecrawl) can be turned off but no longer show a Delete button. Deleting one only brought it back and made another server look expanded.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.1 - 2026-10-13

A pre-release of 0.2.0, for testing before it goes to the Chrome Web Store.

- **New look**: the stylesheets are rewritten on one set of design tokens. Floating panels share one shadow scale, so the smart bar has a proper shadow again, and every earlier animation is still there.
- **Pride themes**: rainbow, trans, lesbian, bi, pan, nonbinary and ace, under General settings. Their soft colors come from each flag.
- **Holiday touches** on well-known days. They use only your device's date, and you can turn them off in settings.
- Counts now use the right plural form in every language.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on. Firefox and Safari builds are still experimental.

## 0.1.0 - 2026-10-13

First public release of OpenBrowserAgent: an AI side panel that reads pages, does research, and works through browser tasks with you, using your own model providers.

**Status:** Chrome and other Chromium-based browsers (Edge, Brave, Arc) are the supported target. The Firefox and Safari builds are experimental. They build and pass the shared tests, but they have not been tested on real browsers yet.

### Install

- **Chrome / Chromium:** unzip `open-browser-agent-0.1.0-chrome.zip`, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select the unzipped folder. A Chrome Web Store listing is on the way.
- **Firefox (experimental):** `open-browser-agent-0.1.0-firefox.zip`. Load it as a temporary add-on from `about:debugging`.
- **Safari (experimental):** `open-browser-agent-0.1.0-safari.zip`. It needs Xcode's Safari web extension converter.
- `open-browser-agent-0.1.0-sources.zip` is the source package for store review.

### Highlights

- **Side panel agents**: Browse and Ask presets, plus custom agents with their own instructions, tools, model and workspace. Sub-agents run in the background.
- **Page tools**: compact page snapshots, find, read, extract with a helper model, act (click, type, select, drag, real input where pages need it), in-place page edits, screenshots, downloads, tab management and tab groups.
- **Web search**: through the browser's default search engine, or through built-in keyless MCP search servers (Exa, Parallel, TinyFish, Firecrawl; off until you turn one on, since each sends queries to a third party). Answers cite their sources.
- **Skills**: built-in skills (fill forms, tidy tabs, help with OpenBrowserAgent, create skills). You can also customize skills, import and export skill packages, or let the agent pick a skill when a request fits.
- **MCP servers**: remote Streamable HTTP servers, with connection testing, per-tool switches, and a per-server option to send requests without the browser `Origin` header.
- **Sync** across devices through WebDAV or browser account sync:
  - per-item merge, so edits on two devices don't overwrite each other;
  - deletions sync safely, and a mass delete asks you first;
  - optional sync of chats and attachments.
  - See [docs/sync.md](https://github.com/Lumysia/OpenBrowserAgent/blob/main/docs/sync.md).
- **Smart bar** for selected text and editable fields: explain, translate, improve wording, read aloud. It is off by default; once on, it can be limited per site.
- **Local execution bridge** (optional): lets an agent run commands on your computer.
- **UI**: 9 interface languages, light and dark themes, and accent colours.

### Good to know

- You bring your own model provider and API key. Nothing is sent anywhere except the providers, MCP servers and sync servers you configure. See [Permissions and privacy](https://github.com/Lumysia/OpenBrowserAgent/blob/main/docs/permissions-and-privacy.md).
- Sync was tested with Koofr WebDAV and a local WebDAV server, on two devices. Other WebDAV services should work if they send strong ETags; the Sync page tells you if a server is not suitable.
- Export important chats before turning on sync for the first time.
- From this release on, updates keep your stored and synced data. Format changes will come with a migration.

Please report problems on the [issue tracker](https://github.com/Lumysia/OpenBrowserAgent/issues).
