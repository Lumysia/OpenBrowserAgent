# Sync

OpenBrowserAgent can keep settings and data the same on several browsers. Sync is off until you pick a backend on the Sync settings page:

- **Browser account sync** uses the sync storage of the browser account you are signed in to. It is small (about 100 KB in Chrome), so it carries settings and keys, but not chats or files.
- **WebDAV** uses a folder on any WebDAV server (Nextcloud, Koofr, InfiniCLOUD, a NAS, …). It carries every group.

## What syncs

What syncs is grouped by size and privacy:

| Group    | Switch                     | What it holds                                                                                                                                                                                                                                                      |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Settings | none, always synced        | Language, preferences (theme included), the sync switches, AI providers without their API keys, agents, MCP servers without their request headers, skills without their files and which skills are on, and each agent's `MEMORY.md` and `USER.md` workspace files. |
| Keys     | off by default             | API keys and MCP request headers, encrypted with your sync passphrase (see below).                                                                                                                                                                                 |
| Chats    | off by default             | Chat history, without attachments.                                                                                                                                                                                                                                 |
| Files    | on by default, WebDAV only | Skill files, agent workspace files other than `MEMORY.md` and `USER.md`, and chat attachments (with chats on).                                                                                                                                                     |

`MEMORY.md` and `USER.md` are part of the agent's system prompt and capped at 2,200 and 1,400 characters, so they travel with the settings. A well-used setup (six AI providers with keys, five agents with full memory files, ten MCP servers, a dozen skills) takes about 40 KB of browser account sync storage.

The backend registry says what each backend can hold: whether it has room for large content (chats and files), whether its stored content can be listed, and whether it announces other devices' changes. On browser account sync, the chats and files switches are shown off with the reason; nothing of them is synced partly.

On a device where files do not sync (browser account sync, or files off), skills and agents still arrive with the settings. Their files on that device stay as they are, and the agent's workspace and the skill editor say that files are not synced here. A device never uploads files it does not have over the ones on the server, and never deletes them there: a part of an item (a skill's files, an AI provider's API key) that a device does not hold has no record of its own on that device.

Local execution bridges do not sync: each one points at a program on one computer.

## Keys and the sync passphrase

Turning on keys asks for a sync passphrase. API keys and MCP request headers are encrypted on the device before they are uploaded, with a key derived from the passphrase (PBKDF2-SHA256, 600,000 iterations, a random salt) and AES-GCM with a random IV per value. The server stores the salt and a check value encrypted with the key, never the passphrase or the key. Everything else is stored as plain gzip-compressed JSON, as before.

- Another device asks for the passphrase once, when it finds keys on the server it cannot read. A wrong passphrase is reported and nothing is stored. The device keeps the derived key in its local storage, so it is not asked again.
- Until then, that device keeps its own keys, and leaves the encrypted keys on the server as they are.
- Changing the passphrase on a device that has the key encrypts the keys again with the new one; the other devices ask for the new passphrase once. The old key is kept until a read shows the new passphrase in place.
- Turning keys off removes the encrypted keys and the check value from the server. Every device keeps the keys it has. Turning keys on again sets a new passphrase.
- The passphrase cannot be recovered. If you forget it, turn keys off and on again with a new one; your keys stay on each device.
- Clearing an API key on one device clears it on the others. An empty API key or header on a device that never had one (a provider form opened before joining) is no value at all and never replaces the account's.

## What is stored on the server

A WebDAV folder holds:

```
root.json.gz           the list of synced items, the only file that is ever overwritten
root.prev.json.gz      the list as it was before the last write (see below)
blobs/<x>/<hash>.gz    larger content: chat messages, skill and workspace files, attachments
```

The root file lists every synced item with a timestamp. Small items (a preference, a provider, an agent, a chat's title) are stored in it directly; keys are stored in it encrypted. Larger content is stored once in `blobs/`, under a name that is the SHA-256 hash of the content, and never changed afterwards. Apart from keys, everything is stored as plain gzip-compressed JSON (attachments as their bytes), not encrypted, so treat the folder like the data in it.

Browser account sync stores the same items, one per storage entry, with large items split into parts under the 8 KB entry limit, and the format and the passphrase's check value in one more entry.

The sync format has a version. A device that finds an older one (from before an update) replaces it with its own data on its first sync; the other devices upload theirs on their next sync. A device that finds a newer one stops syncing until it is updated.

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
- An item this device never changed (a default value, data from before an update that started keeping these times) counts as older than any change made anywhere, so a new browser where you changed a few settings before turning sync on keeps exactly those changes and takes the account's other settings.
- A settings page or the side panel that saves while a download it has not shown yet arrives keeps the download: the save is merged with what is stored (field by field, list items by id; chat messages by id). The agent's tools for MCP servers and skills change only the item they work on, in what is stored when they save, after any connection test, so a download that arrived during the test stays.
- When two devices changed the same chat (or skill or workspace files), the merge compares both with the version the change was made from. A device keeps that version of what it changed, and the version it uploaded, until its upload is confirmed, so a chat changed offline for days still merges correctly after the server deleted the old version: a reply the other device regenerated or a message it deleted does not come back. This holds whatever made the change: an edit, a merge whose upload failed, or items kept against deletions from another device. It is stored with the change's timestamp, in the same storage write, and removed once no unconfirmed change needs it.
- An item deleted on one device and changed on another is kept with the change. So the app stores only what you changed: opening a chat, opening a settings page, running an agent or saving one item never rewrites others. What the app fills in when it reads data (default values, built-in MCP servers, data of an earlier version in today's form, a sorted list) is shown, not stored, and a save keeps every part it did not change as it was stored; data a newer version stored that this one does not read (a field, a list item) stays too. An item stored without an id (older, imported or hand-edited data) or with a file path in another form (`notes\a.md`) is the same item as the one shown: reading names it by its place and content (or reads its path as `notes/a.md`) the same way every time, a save that leaves it alone keeps it as stored, and an edit or delete of it changes that item. A save that edits or moves it stores the name it was shown with. Adding one MCP server stores that server, not the built-ins next to it, so a built-in you set up on another device keeps your setup. A save that reorders a list stores the order, built-ins included. In particular, saving a provider changes the display names of its models only when you rename it; an agent's workspace gets its default files (`MEMORY.md`, `USER.md`, `NOTES.md`) only when it is created, so one you deleted stays deleted; a reply that finds a page the chat already cites leaves that source as it is.
- A reply still streaming uploads once it has finished, however long it takes. A reply whose run stopped without finishing (the browser closed mid-reply) uploads as it is, and every device shows it as ended without changing it, so a device that opens it later cannot replace the reply as it was regenerated or deleted elsewhere.
- Deletions are recorded as deletions. A file missing on the server never deletes anything on your devices; if the server lost data, the devices that still have it upload it again.
- When two devices add messages to the same chat at the same time, both keep all messages, in time order.
- When two devices edit the same skill or workspace file, the newer edit keeps the file name and the other is kept next to it as `name.conflict-<device>-<date>.ext`. Two files with the same content never conflict. A workspace two devices created without syncing in between (each opened the agents page or ran the agent first, or the workspace had not arrived yet when the agent did) merges as if both had started from the default files: a default file nobody edited never replaces a real one, and an agent's memory written on one device stays its memory. A file you set back to its default text (clearing `MEMORY.md`) counts as an edit where it is the newer edit of that file: it keeps the name and the other text is kept next to it as a conflict copy (or, if the other device's change to the workspace is the newer one, the other way round). An older reset to the default text loses to a newer edit on the other device without a conflict copy, as an untouched default file does. Default files stored by an earlier version carry the time they were created, not "never edited", so in such a merge they count as edits made then: an edit made before that on the other device keeps a conflict copy instead of the name.
- Chats are downloaded on a device only when you open them there. Attachments are downloaded when a chat shows them. Opening a chat does not wait for a sync in progress.
- If a sync would delete more than half of a list with more than five items, it pauses and asks on the Sync page:
  - deletions from another device (for example, most of your chats): delete them on this device, or keep them and upload them again. Keeping uploads exactly those items again, as new changes; an item whose content is neither on this device nor on the server any more (a chat never opened here, deleted elsewhere more than a day ago) cannot come back and is deleted.
  - deletions made on this device: delete them on every device, or restore them here from the synced copy.
- If both kinds of prompt are open for the same list, each gets its own answer. Restored items keep their place in the list.
- Clearing local data on the Debug page (with sync on or off) also forgets the timestamps of what it cleared, so the data is downloaded again instead of being deleted on your other devices. It waits for a page's save in progress, so the save cannot bring the cleared data back. Clearing cloud data deletes the folder's content; every device uploads its data again.
- Each backend keeps a small cache on the device (the last file list it read), so switching to another backend and back needs no full download. Spellings of one WebDAV folder (http or https, host name case, a trailing slash) count as the same folder. The WebDAV address and user name are saved when you leave the field or press Enter.

## Server requirements

WebDAV writes the root file only if it is still the version the device read (`If-Match` with the file's ETag). If two devices write at once, the later one reads the new version, merges, and tries again. A server that refuses the upload because another one of the same file is still running (`423 Locked`, as Koofr does) is treated the same way: the device waits a moment, reads again and retries. This needs a server that sends strong ETags. When connecting, OpenBrowserAgent checks the server with a small test file that it deletes again:

- If the server's file versions are unreliable (missing or weak ETags, or a server that rejects its own ETags), this device stops uploading and the Sync page says so; it keeps downloading changes from other devices.
- If the server accepts uploads whatever `If-Match` says (Koofr did in October 2026), two devices saving at the same moment can overwrite each other's root file. The Sync page notes it. A device does not count an upload as done when the server accepts it, only when a later read shows that the items it uploaded still hold its changes (the same versions, or versions made from them). Until then its changes stay marked as waiting, so a change that was overwritten is merged again with the version that replaced it at the device's next sync. If both devices changed the same value, the newer one is kept. The confirming read is the next sync, not a read right after the upload: the other device's upload may still be on its way at that moment.

A request that gets no answer within 30 seconds (longer for large uploads) fails, and the sync tries again later. An upload of the root file may still have arrived (the answer was lost, or the browser closed while waiting): the device records what it uploaded before sending it, so changes made after that count as made on top of it. The next sync uploads them as they are instead of merging them again with the upload, so a reply regenerated or a setting changed back meanwhile stays that way.

Content that no item refers to any more is deleted from `blobs/` a day later, after a root file without it was written. If another device starts using the same content again at that moment, it notices in its next sync that the file is gone and uploads it again.

## A damaged root file

Some servers write a file in two steps: Koofr stores an empty version first and then the content, so an upload that stops in between leaves an empty `root.json.gz`. Before replacing the root, a device therefore writes the root it is replacing to `root.prev.json.gz`. A device that finds the root empty, cut off or not valid JSON rebuilds it from that copy (if it is good) and from its own data, merges its changes as usual and writes a good root; the Sync page notes it for a day. Without a good copy, it rebuilds from its own data. Nothing is deleted on any device: the other devices upload what the rebuilt root is missing on their next sync. Deletions made since the copy may come back, as with any server that lost data.

## Status

The Sync settings page shows the last successful sync, the number of changes waiting to upload, a pause with its reason, and warnings about the server. **Sync now** runs a check at once.

## Testing

`npm test` covers the merge rules, clocks, root validation, damaged roots (`sync-damaged-root`: empty, cut off and invalid roots, with and without a previous copy), the sync groups and encrypted keys (`sync-groups-and-keys`, `sync-files-group`, which also measures a realistic set of settings in browser account sync), upgrading from the last release (`sync-upgrade`), the mass-delete guards, browser sync item limits, every data-loss case found in reviews (one `tests/sync-*.test.ts` file per area, such as `sync-lost-write-answers`, `sync-read-ids` or `sync-default-workspaces`), the app paths that must not store what the user did not change (`tests/sync-background-*.test.ts`, which run the app's own storage, side panel and settings code against test devices) and everyday scenarios such as setting up a new browser or trying browser sync for a week (`tests/sync-scenarios.test.ts`). Against a real WebDAV server (for example WsgiDAV), `npm run test:sync:webdav -- <urlA> <urlB>` runs two simulated devices through the cases that matter most; the two URLs should reach the same folder through different host names. Two optional pairs of URLs add the cases for a server without ETags and for one that ignores `If-Match` (through a proxy that drops those headers). One case uploads a root file whose answer never arrives; two follow a reply that is still streaming, or whose run died, while another device opens it. `node scripts/sync-mutations.mjs` breaks each safety guard listed in `scripts/sync-mutations/` on purpose and checks that a test fails.
