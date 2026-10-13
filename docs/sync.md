# Sync

OpenBrowserAgent can keep settings and data the same on several browsers. Sync is off until you pick a backend on the Sync settings page:

- **Browser account sync** uses the sync storage of the browser account you are signed in to. It is small (about 100 KB in Chrome), so it carries settings, providers, agents, skills, MCP servers and local execution bridges, but not chats or attachments.
- **WebDAV** uses a folder on any WebDAV server (Nextcloud, Koofr, InfiniCLOUD, a NAS, …). It carries everything, including chats and chat attachments.

Language, preferences and the sync settings themselves always sync. Each other category has its own switch; providers are on by default.

## What is stored on the server

A WebDAV folder holds:

```
root.json.gz           the list of synced items, the only file that is ever overwritten
blobs/<x>/<hash>.gz    larger content: chat messages, skill and workspace files, attachments
```

The root file lists every synced item with a timestamp. Small items (a preference, a provider, an agent, a chat's title) are stored in it directly. Larger content is stored once in `blobs/`, under a name that is the SHA-256 hash of the content, and never changed afterwards. Everything is stored as plain gzip-compressed JSON (attachments as their bytes), not encrypted, so treat the folder like the data in it: it contains provider API keys when provider sync is on.

Browser account sync stores the same items, one per storage entry, with large items split into parts under the 8 KB entry limit.

## When it syncs

All syncing runs in the extension's background, shared by every open page:

- when the browser starts, and when an extension page (the side panel, the settings page) opens or gets focus;
- a few seconds after you change something;
- once a minute while an extension page is visible;
- never on a timer while no extension page is open. The next time you open one, it catches up.

When nothing changed, a check is a single small request that the server answers with "not modified". With a page open all the time that is about 60 requests an hour per browser. Browser account sync is told about changes by the browser and makes no requests of its own.

If the server answers "too many requests" (HTTP 429) or "temporarily unavailable" (503), all sync pauses: first for a minute, then doubling up to an hour, or as long as the server asks. The Sync page shows until when.

## Changes on several devices

- Each item carries a timestamp from a hybrid clock. When two devices change the same item, the newer change wins; when they changed different parts of it (one a provider's API key, the other its model, or each added a header to the same MCP server or a model to the same provider), both changes are kept: fields merge one by one, nested values too, and list entries by id (a list reordered on one device keeps that order). Only a value both changed takes the newer one; a list of plain values (a command's arguments) counts as one value. A browser restored from an old backup cannot overwrite newer data with its old copy.
- Each item also names the changes of other devices it includes. A device knows its upload arrived when the item on the server is that version or one made from it, however many uploads other devices made since, so a change it made earlier is never merged again with a version that already holds it. Every change's timestamp ends in a random part, so it names that one change: only the exact timestamp counts as proof, never a later one with the same device id. Only the device that made a change asks about it, so a device leaves out its own changes once it no longer waits for them, and an item names a change for 90 days at most: in browser account sync the names of every browser that ever changed an item would otherwise fill the quota over the years. A device that comes back more than 90 days after an upload it never saw confirmed merges that change again from the version it was made from.
- The device id lives in the extension's local storage, so a copied browser profile or a backup restored on another computer carries it along. Each change is still named on its own, so the two browsers' changes merge as those of two devices, with one exception: a change one of them was still waiting for when the profile was copied, which the other browser then changed again more than once before syncing, may be merged again from the version before it. A browser that finds a change with its id that it never made (one newer than anything it did, or one it does not know that is newer than an upload it still waits for) takes a new id, and the Sync page says so for a day.
- The device keeps that timestamp for every item it has, whichever backend is on and with sync off too: an edit gets the time it was made, one item at a time (changing one provider does not touch the others' times), and a change downloaded from another device keeps that device's time. A downloaded change is stored only if the item's timestamp is still the one the sync compared, so an edit made while the sync ran (even the first edit of an item) is never overwritten; the next sync compares it again. Switching to another backend and back, joining an existing sync, or turning sync on again after a while is therefore no special case: for each item, the newer change wins, wherever it was made.
- An item this device never changed (a default value, data from before an update that started keeping these times) counts as older than any change made anywhere, so a new browser where you changed a few settings before turning sync on keeps exactly those changes and takes the account's other settings. An empty API key or secret on a device that never saw the account's value (a provider form opened before joining) never replaces the account's.
- A settings page or the side panel that saves while a download it has not shown yet arrives keeps the download: the save is merged with what is stored (field by field, list items by id; chat messages by id). The agent's tools for MCP servers, local execution bridges and skills change only the item they work on, in what is stored when they save, after any connection test, so a download that arrived during the test stays.
- When two devices changed the same chat (or skill or workspace files), the merge compares both with the version the change was made from. A device keeps that version of what it changed, and the version it uploaded, until its upload is confirmed, so a chat changed offline for days still merges correctly after the server deleted the old version: a reply the other device regenerated or a message it deleted does not come back. This holds whatever made the change: an edit, a merge whose upload failed, or items kept against deletions from another device. It is stored with the change's timestamp, in the same storage write, and removed once no unconfirmed change needs it.
- An item deleted on one device and changed on another is kept with the change. So the app stores only what you changed: opening a chat, opening a settings page, running an agent or saving one item never rewrites others. What the app fills in when it reads data (default values, built-in MCP servers, data of an earlier version in today's form, a sorted list) is shown, not stored, and a save keeps every part it did not change as it was stored; data a newer version stored that this one does not read (a field, a list item) stays too. Adding one MCP server stores that server, not the built-ins next to it, so a built-in you set up on another device keeps your setup. A save that reorders a list stores the order, built-ins included. In particular, saving a provider changes the display names of its models only when you rename it; an agent's workspace gets its default files (`MEMORY.md`, `USER.md`, `NOTES.md`) only when it is created, so one you deleted stays deleted; a reply that finds a page the chat already cites leaves that source as it is.
- A reply still streaming uploads once it has finished, however long it takes. A reply whose run stopped without finishing (the browser closed mid-reply) uploads as it is, and every device shows it as ended without changing it, so a device that opens it later cannot replace the reply as it was regenerated or deleted elsewhere.
- Deletions are recorded as deletions. A file missing on the server never deletes anything on your devices; if the server lost data, the devices that still have it upload it again.
- When two devices add messages to the same chat at the same time, both keep all messages, in time order.
- When two devices edit the same skill or workspace file, the newer edit keeps the file name and the other is kept next to it as `name.conflict-<device>-<date>.ext`. Two files with the same content never conflict. A workspace two devices created without syncing in between (each opened the agents page or ran the agent first, or the workspace had not arrived yet when the agent did) merges as if both had started from the default files: a default file nobody edited never replaces a real one, and an agent's memory written on one device stays its memory.
- Chats are downloaded on a device only when you open them there. Attachments are downloaded when a chat shows them. Opening a chat does not wait for a sync in progress.
- If a sync would delete more than half of a list with more than five items, it pauses and asks on the Sync page:
  - deletions from another device (for example, most of your chats): delete them on this device, or keep them and upload them again. Keeping uploads exactly those items again, as new changes; an item whose content is neither on this device nor on the server any more (a chat never opened here, deleted elsewhere more than a day ago) cannot come back and is deleted.
  - deletions made on this device: delete them on every device, or restore them here from the synced copy.
- If both kinds of prompt are open for the same list, each gets its own answer. Restored items keep their place in the list.
- Clearing local data on the Debug page (with sync on or off) also forgets the timestamps of what it cleared, so the data is downloaded again instead of being deleted on your other devices. It waits for a page's save in progress, so the save cannot bring the cleared data back. Clearing cloud data deletes the folder's content; every device uploads its data again.
- Each backend keeps a small cache on the device (the last file list it read), so switching to another backend and back needs no full download. Spellings of one WebDAV folder (http or https, host name case, a trailing slash) count as the same folder. The WebDAV address and user name are saved when you leave the field or press Enter.

## Server requirements

WebDAV writes the root file only if it is still the version the device read (`If-Match` with the file's ETag). If two devices write at once, the later one reads the new version, merges, and tries again. This needs a server that sends strong ETags. When connecting, OpenBrowserAgent checks the server with a small test file that it deletes again:

- If the server's file versions are unreliable (missing or weak ETags, or a server that rejects its own ETags), this device stops uploading and the Sync page says so; it keeps downloading changes from other devices.
- If the server accepts uploads whatever `If-Match` says (Koofr did in October 2026), two devices saving at the same moment can overwrite each other's root file. The Sync page notes it. A device does not count an upload as done when the server accepts it, only when a later read shows that the items it uploaded still hold its changes (the same versions, or versions made from them). Until then its changes stay marked as waiting, so a change that was overwritten is merged again with the version that replaced it at the device's next sync. If both devices changed the same value, the newer one is kept. The confirming read is the next sync, not a read right after the upload: the other device's upload may still be on its way at that moment.

A request that gets no answer within 30 seconds (longer for large uploads) fails, and the sync tries again later. An upload of the root file may still have arrived (the answer was lost, or the browser closed while waiting): the device records what it uploaded before sending it, so changes made after that count as made on top of it. The next sync uploads them as they are instead of merging them again with the upload, so a reply regenerated or a setting changed back meanwhile stays that way.

Content that no item refers to any more is deleted from `blobs/` a day later, after a root file without it was written. If another device starts using the same content again at that moment, it notices in its next sync that the file is gone and uploads it again.

## Status

The Sync settings page shows the last successful sync, the number of changes waiting to upload, a pause with its reason, and warnings about the server. **Sync now** runs a check at once.

## Testing

`npm test` covers the merge rules, clocks, root validation, the mass-delete guards, browser sync item limits, every data-loss case found in reviews (`tests/sync-review*.test.ts`), the app paths that must not store what the user did not change (`tests/sync-background-*.test.ts`, which run the app's own storage, side panel and settings code against test devices) and everyday scenarios such as setting up a new browser or trying browser sync for a week (`tests/sync-scenarios.test.ts`). Against a real WebDAV server (for example WsgiDAV), `npm run test:sync:webdav -- <urlA> <urlB>` runs two simulated devices through the cases that matter most; the two URLs should reach the same folder through different host names. Two optional pairs of URLs add the cases for a server without ETags and for one that ignores `If-Match` (through a proxy that drops those headers). One case uploads a root file whose answer never arrives; two follow a reply that is still streaming, or whose run died, while another device opens it. `node scripts/sync-mutations.mjs` breaks each safety guard listed in `scripts/sync-mutation-list.mjs` (and the files it includes) on purpose and checks that a test fails.
