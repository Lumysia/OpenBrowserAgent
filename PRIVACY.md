# Privacy Policy

Last updated: October 13, 2026

This policy covers the OpenBrowserAgent browser extension ("the extension"). The extension is open source; its code is at https://github.com/Lumysia/OpenBrowserAgent.

## Summary

The developer does not collect, receive, store, or sell any of your data. The extension has no account system, no server of its own, no analytics, and no advertising. What you type, the pages you share with it, and your settings stay in your browser, except where you send them to a service you configured yourself.

## Data the extension handles

To work, the extension handles:

- **Your messages and chats** with the agent.
- **Web page content** you share or that the agent reads for a task: page text, titles, URLs, selected elements, screenshots, and files you attach.
- **Browsing activity needed for a task**: the list of open tabs, and the pages the agent opens, reads, or interacts with.
- **Settings and credentials** you enter: model provider settings and API keys, agents, skills, MCP server settings, sync settings, and local execution bridge settings.

## Where the data goes

The extension stores this data in your browser's local extension storage.

It sends data only to services you configure and turn on:

- **Model providers** (for example OpenAI, Anthropic, Google, OpenRouter, or a local Ollama server). They receive your messages, chat history, and the page content and tool results needed to answer. Their own privacy policies apply.
- **MCP servers** you add or turn on, including the built-in web search servers, which are off until you turn them on. They receive the tool requests the agent sends them, such as search queries.
- **Sync storage**, if you turn sync on: your browser account's sync storage, or a WebDAV server you choose. It receives the items you chose to sync.
- **Your browser's default search engine**, when the agent searches the web through it.
- **A local execution bridge**, only if you install one on your computer and enable it.

The extension also fetches web pages, images, and link previews that you or the agent open as part of a task.

## What the developer does not do

- No data is sent to the developer or to any server operated by the developer.
- No data is sold or transferred to third parties, except to the services you configure as described above.
- No data is used or transferred for purposes unrelated to the extension's single purpose (an AI agent that helps you with tasks in your browser).
- No data is used or transferred to determine creditworthiness or for lending purposes.
- No data is used for advertising.

The use of information received from Google APIs complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## Your control

- Delete chats, agents, skills, and settings in the extension at any time. Uninstalling the extension removes its local storage.
- Sync is off until you choose a sync backend, and you choose what to sync.
- Remove a provider, MCP server, or sync backend to stop sending data to it.

More detail on each browser permission and on what is sent where: [Permissions and Privacy](docs/permissions-and-privacy.md) and [Sync](docs/sync.md).

## Children

The extension is not directed at children under 13.

## Changes

Changes to this policy are published in this file, and its history is visible in the repository.

## Contact

Questions or concerns: open an issue at https://github.com/Lumysia/OpenBrowserAgent/issues.
