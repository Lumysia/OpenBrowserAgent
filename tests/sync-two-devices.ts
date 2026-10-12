// Two devices against a real WebDAV server, covering the cases that once
// lost or hid data. Each case gets its own folder.
//
//   node --import tsx tests/sync-two-devices.ts <urlA> <urlB> [<noEtagUrlA> <noEtagUrlB>]
//
// urlA and urlB must reach the same folder through different hosts (for
// example 127.0.0.1 and localhost), so no cache can be shared between the
// devices by accident. The optional pair goes through a proxy that strips
// ETags.
import assert from "node:assert/strict";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { SYNC_WARNINGS } from "../src/shared/sync/state";
import { createWebDavTransport } from "../src/shared/sync/webdav";
import { ALL_ON, chat, device, type Device } from "./sync-fixtures";

const [baseA, baseB, plainA, plainB] = process.argv.slice(2);
if (!baseA || !baseB)
  throw new Error("usage: sync-two-devices.ts <urlA> <urlB>");
const CHATS = STORAGE_KEYS.chats;
const run = Date.now().toString(36);
const log: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// WsgiDAV's ETag has one-second resolution: space writes of a case apart.
const tick = () => sleep(1100);

function loggingFetch(
  name: string,
  fail?: { next: (method: string) => boolean },
) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = new URL(String(input));
    if (fail?.next(method)) {
      log.push(`${name} ${method} ${url.pathname} -> (network error)`);
      throw new TypeError("fetch failed");
    }
    const response = await fetch(input, init);
    log.push(
      `${name} ${method} ${url.pathname.replace(/.*\/case-[^/]+\//, "")} ${response.status}`,
    );
    return response;
  };
}

async function folder(base: string, name: string) {
  const url = `${base.replace(/\/?$/, "/")}case-${run}-${name}/`;
  const response = await fetch(url, { method: "MKCOL" });
  if (!response.ok && response.status !== 405)
    throw new Error(`MKCOL ${response.status}`);
  return url;
}

function pair(
  name: string,
  urls = [baseA, baseB],
  failA?: { next: (method: string) => boolean },
) {
  const clock = {
    get now() {
      return Date.now();
    },
  };
  // One after the other: parallel MKCOLs of one folder fail on WsgiDAV.
  return folder(urls[0], name)
    .then(async (urlA) => [urlA, await folder(urls[1], name)])
    .then(([urlA, urlB]) => ({
      a: device(
        "deviceA",
        createWebDavTransport({ url: urlA }, loggingFetch("A", failA)),
        clock,
        ALL_ON,
      ),
      b: device(
        "deviceB",
        createWebDavTransport({ url: urlB }, loggingFetch("B")),
        clock,
        ALL_ON,
      ),
    }));
}

async function saveChat(
  on: Device,
  id: string,
  messages: Array<[string, number]>,
) {
  const { summary, content } = chat(id, messages);
  const list = (on.get<Array<{ id: string }>>(CHATS) ?? []).filter(
    (item) => item.id !== id,
  );
  await on.set(CHATS, [...list, summary]);
  await on.set(`${CHATS}/${id}`, content);
}

const ids = (on: Device) =>
  (on.get<Array<{ id: string }>>(CHATS) ?? []).map((item) => item.id).sort();
const messages = (on: Device, id: string) =>
  on
    .get<{ messages: Array<{ id: string }> }>(`${CHATS}/${id}`)
    ?.messages.map((m) => m.id);

const cases: Record<string, () => Promise<void>> = {
  async "request counts: first upload, idle check, one-chat edit, lazy open"() {
    const { a, b } = await pair("counts");
    await saveChat(a, "c1", [["m1", 1]]);
    log.push("-- A first upload");
    await a.sync("edit");
    await tick();
    log.push("-- A idle check (expect one 304)");
    const before = log.length;
    await a.sync("poll");
    assert.deepEqual(log.slice(before), ["A GET root.json.gz 304"]);
    log.push("-- B first check (root only, chat not opened)");
    await b.sync("startup");
    assert.deepEqual(ids(b), ["c1"]);
    assert.equal(b.get(`${CHATS}/c1`), undefined);
    await tick();
    log.push(
      "-- A edits one chat (expect GET root 304, PUT blob, PUT root; a new blob folder adds a MKCOL)",
    );
    const edit = log.length;
    await saveChat(a, "c1", [
      ["m1", 1],
      ["m2", 2],
    ]);
    await a.sync("edit");
    const lines = log
      .slice(edit)
      .map((line) => line.replace(/blobs\/\w\/\w+\.gz/, "blob"));
    // The first blob in a new shard folder costs a 409 and one MKCOL.
    const folderSetup = lines.filter((line) =>
      / MKCOL |PUT blob 409/.test(line),
    );
    assert.ok(
      folderSetup.length === 0 || folderSetup.length === 2,
      lines.join("; "),
    );
    assert.deepEqual(
      lines.filter((line) => !folderSetup.includes(line)),
      ["A GET root.json.gz 304", "A PUT blob 201", "A PUT root.json.gz 204"],
    );
  },

  async "overlapping saves of the same chat (both at once)"() {
    const { a, b } = await pair("overlap");
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    await b.sync();
    await b.env.local.set({ [`${CHATS}/c1`]: chat("c1", [["m1", 1]]).content });
    await tick();
    await saveChat(a, "c1", [
      ["m1", 1],
      ["a2", 2],
    ]);
    await saveChat(b, "c1", [
      ["m1", 1],
      ["b3", 3],
    ]);
    await Promise.all([a.sync("edit"), b.sync("edit")]);
    await tick();
    await a.sync();
    await b.sync();
    assert.deepEqual(messages(a, "c1"), ["m1", "a2", "b3"]);
    assert.deepEqual(messages(b, "c1"), ["m1", "a2", "b3"]);
  },

  async "message order when both devices add messages at once"() {
    const { a, b } = await pair("order");
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    await b.sync();
    await b.env.local.set({ [`${CHATS}/c1`]: chat("c1", [["m1", 1]]).content });
    await tick();
    await saveChat(b, "c1", [
      ["m1", 1],
      ["b2", 2],
      ["b5", 5],
    ]);
    await saveChat(a, "c1", [
      ["m1", 1],
      ["a3", 3],
      ["a4", 4],
    ]);
    await Promise.all([b.sync("edit"), a.sync("edit")]);
    await tick();
    await Promise.all([a.sync(), b.sync()]);
    assert.deepEqual(messages(a, "c1"), ["m1", "b2", "a3", "a4", "b5"]);
    assert.deepEqual(messages(b, "c1"), messages(a, "c1"));
  },

  async "a cloud clear on one device while another writes"() {
    const { a, b } = await pair("clear");
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    await b.sync();
    await tick();
    await saveChat(b, "c2", [["n1", 2]]);
    // A round that loses the race may fail; the next one catches up.
    await Promise.allSettled([a.context.transport.clear(), b.sync("edit")]);
    await tick();
    await a.sync();
    await b.sync();
    assert.deepEqual(ids(a), ["c1", "c2"]);
    assert.deepEqual(ids(b), ["c1", "c2"]);
    assert.ok(messages(a, "c1"));
  },

  async "a failed first upload loses nothing and finishes later"() {
    let failures = 1;
    const { a, b } = await pair("failed-upload", [baseA, baseB], {
      next: (method) => method === "PUT" && failures-- > 0,
    });
    await saveChat(a, "c1", [["m1", 1]]);
    await assert.rejects(a.sync("edit"));
    assert.equal((await a.state()).pending["chats/c1"] !== undefined, true);
    await a.sync("poll");
    await b.sync();
    assert.deepEqual(ids(b), ["c1"]);
  },

  async "deleting a chat this device never opened"() {
    const { a, b } = await pair("delete-unopened");
    await saveChat(a, "c1", [["m1", 1]]);
    await saveChat(a, "c2", [["m2", 1]]);
    await a.sync("edit");
    await b.sync();
    await tick();
    await b.set(
      CHATS,
      b.get<Array<{ id: string }>>(CHATS).filter((item) => item.id !== "c1"),
    );
    await b.sync("edit");
    await a.sync();
    assert.deepEqual(ids(a), ["c2"]);
    assert.equal(a.get(`${CHATS}/c1`), undefined);
  },

  async "turning sync off while the server is down"() {
    const { a } = await pair("server-down");
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    const down = createWebDavTransport(
      { url: "http://127.0.0.1:9/dav/" },
      loggingFetch("A"),
    );
    const offline = { ...a.context, transport: down };
    await saveChat(a, "c1", [
      ["m1", 1],
      ["m2", 2],
    ]);
    const { runSyncRound } = await import("../src/shared/sync/engine");
    await assert.rejects(runSyncRound(offline, "edit"));
    // Sync off: nothing to do; the device keeps everything it has.
    assert.deepEqual(messages(a, "c1"), ["m1", "m2"]);
    // Back on, the change still uploads.
    await a.sync("poll");
    assert.equal((await a.state()).pending["chats/c1"], undefined);
  },

  async "a device restored from an old backup"() {
    const { a, b } = await pair("backup");
    await a.set(STORAGE_KEYS.preferences, { colorScheme: "dark" });
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    const backup = structuredClone(a.env.local.data);
    await b.sync();
    await tick();
    await b.set(STORAGE_KEYS.preferences, { colorScheme: "light" });
    await b.set(CHATS, []);
    await b.sync("edit");
    for (const key of Object.keys(a.env.local.data))
      delete a.env.local.data[key];
    Object.assign(a.env.local.data, backup);
    await a.sync("startup");
    assert.equal(
      a.get<{ colorScheme: string }>(STORAGE_KEYS.preferences).colorScheme,
      "light",
    );
    assert.deepEqual(ids(a), []);
  },
};

if (plainA && plainB)
  cases["a server that strips ETags: reads work, writes stop with a warning"] =
    async () => {
      const { a, b } = await pair("no-etag", [plainA, plainB]);
      await a.set(STORAGE_KEYS.language, "de-DE");
      const first = await a.sync("edit");
      assert.equal(first.pending, 0, "creating the root needs no ETag");
      await b.sync();
      assert.equal(b.get(STORAGE_KEYS.language), "de-DE");
      await tick();
      await b.set(STORAGE_KEYS.language, "fr-FR");
      const second = await b.sync("edit");
      assert.deepEqual(second.warnings, [SYNC_WARNINGS.unreliableEtags]);
      assert.equal(second.pending, 1);
      assert.equal(b.get(STORAGE_KEYS.language), "fr-FR");
      await a.sync();
      assert.equal(a.get(STORAGE_KEYS.language), "de-DE");
    };

let failed = 0;
for (const [name, body] of Object.entries(cases)) {
  const start = log.length;
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
  console.log(
    log
      .slice(start)
      .map((line) => `     ${line}`)
      .join("\n"),
  );
}
process.exitCode = failed ? 1 : 0;
