// Two devices against a real WebDAV server, covering the cases that once
// lost or hid data. Each case gets its own folder.
//
//   node --import tsx tests/sync-two-devices.ts <urlA> <urlB> \
//     [<noEtagUrlA> <noEtagUrlB> [<ignoringUrlA> <ignoringUrlB>]]
//
// urlA and urlB must reach the same folder through different hosts (for
// example 127.0.0.1 and localhost), so no cache can be shared between the
// devices by accident. The optional pairs go through a proxy that strips
// ETags, and one that drops If-Match and If-None-Match (a server that
// ignores version checks). With SYNC_RESULTS=<file> set, the names of the
// failed cases are also written there as JSON.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  createSyncRunner,
  loadContent,
  resetSync,
} from "../src/background/sync/service";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { loadClocks } from "../src/shared/sync/clocks";
import { SYNC_WARNINGS } from "../src/shared/sync/state";
import type { Transport } from "../src/shared/sync/transport";
import { createWebDavTransport } from "../src/shared/sync/webdav";
import { chat, hookedTransport } from "./sync-fixtures";
import { backgroundWriteCases } from "./sync-two-devices-background";
import { dayOfUseCases } from "./sync-two-devices-day";
import { lostAnswerCases } from "./sync-two-devices-lost";
import {
  CHATS,
  ids,
  log,
  loggingFetch,
  messages,
  pair as pairOn,
  run,
  saveChat,
  tick,
  type FailingFetch,
} from "./sync-two-devices-helpers";

const [baseA, baseB, plainA, plainB, ignoringA, ignoringB] =
  process.argv.slice(2);
if (!baseA || !baseB)
  throw new Error("usage: sync-two-devices.ts <urlA> <urlB>");
const pair = (name: string, urls = [baseA, baseB], failA?: FailingFetch) =>
  pairOn(name, urls, failA);

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
      "-- A edits one chat (expect GET root 304, PUT blob, PUT the previous root's copy, PUT root; a new blob folder adds a MKCOL)",
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
      [
        "A GET root.json.gz 304",
        "A PUT blob 201",
        "A PUT root.prev.json.gz 201",
        "A PUT root.json.gz 204",
      ],
    );
  },

  async "an empty root after an interrupted upload: rebuilt, nothing lost"() {
    const { a, b } = await pair("damaged");
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    await tick();
    await b.sync();
    await saveChat(b, "c2", [["m2", 1]]);
    await b.sync("edit");
    await tick();
    // The upload stopped after the server stored an empty file.
    const root = `${baseA.replace(/\/?$/, "/")}case-${run}-damaged/root.json.gz`;
    assert.ok((await fetch(root, { method: "PUT", body: "" })).ok);
    await saveChat(a, "c3", [["m3", 1]]);
    const result = await a.sync("edit");
    assert.deepEqual(result.warnings, [SYNC_WARNINGS.recoveredRoot]);
    await tick();
    await b.sync();
    await tick();
    await a.sync();
    for (const on of [a, b])
      assert.deepEqual(ids(on).sort(), ["c1", "c2", "c3"], on.name);
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
    await a.sync();
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
    assert.equal((await loadClocks(a.env.local, "chats")).c1?.local, true);
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
    // Back on, the change still uploads; the next read confirms it.
    await a.sync("poll");
    await tick();
    await a.sync("poll");
    assert.equal((await loadClocks(a.env.local, "chats")).c1?.local, undefined);
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

  async "opening a chat while a round updates it"() {
    const { a, b } = await pair("open-during-round");
    await saveChat(a, "c1", [["m1", 1]]);
    await a.sync("edit");
    await b.sync();
    await tick();
    await saveChat(a, "c1", [
      ["m1", 1],
      ["a2", 2],
    ]);
    await a.sync("edit");
    await tick();
    // An "open" round runs while the chat's content downloads.
    const base = b.context.transport;
    let hooked = false;
    b.context.transport = {
      ...base,
      async getBlob(hash) {
        if (!hooked) {
          hooked = true;
          await b.sync("open");
        }
        return base.getBlob(hash);
      },
    };
    assert.equal(await loadContent(b.context, "chats", "c1"), true);
    b.context.transport = base;
    await b.set(`${CHATS}/c1`, b.get(`${CHATS}/c1`));
    await b.sync("edit");
    await tick();
    await a.sync();
    assert.deepEqual(messages(a, "c1"), ["m1", "a2"]);
    assert.deepEqual(messages(b, "c1"), ["m1", "a2"]);
  },

  async "clearing local chats while a round runs"() {
    const { a, b } = await pair("clear-during-round");
    for (const id of ["c1", "c2", "c3"]) await saveChat(b, id, [[id, 1]]);
    await b.sync("edit");
    await a.sync();
    await tick();
    const base = b.context.transport;
    let reset: Promise<void> | undefined;
    b.context.transport = {
      ...base,
      async readRoot(etag) {
        reset ??= resetSync(b.env, b.context, false, [CHATS]);
        return base.readRoot(etag);
      },
    };
    await b.sync("poll");
    await reset;
    b.context.transport = base;
    await b.remove(CHATS);
    await b.sync("manual");
    await tick();
    await a.sync();
    assert.deepEqual(ids(a), ["c1", "c2", "c3"]);
    assert.deepEqual(ids(b), ["c1", "c2", "c3"]);
  },

  // The second review's C3: the round runner has a round running and one
  // queued when the debug page clears local chats (and the cloud).
  async "clearing chats while the runner has rounds queued"() {
    for (const remote of [false, true]) {
      const { a, b } = await pair(`clear-queued-${remote}`);
      const runner = createSyncRunner(
        b.env,
        () => undefined,
        async () => b.context,
      );
      for (const id of ["c1", "c2", "c3"]) await saveChat(b, id, [[id, 1]]);
      // a holds every chat's content too, so a cloud clear loses nothing.
      for (const id of ["c1", "c2", "c3"]) await saveChat(a, id, [[id, 1]]);
      await runner.request({ reason: "edit" });
      await tick();
      await a.sync();
      await tick();
      void runner.request({ reason: "poll" });
      void runner.request({ reason: "poll" });
      await resetSync(b.env, b.context, remote, [CHATS, STORAGE_KEYS.chatTabs]);
      await b.settle();
      await runner.request({ reason: "manual" });
      for (let i = 0; i < 2; i++) {
        await tick();
        await a.sync();
        await tick();
        await runner.request({ reason: "poll" });
      }
      const read = await a.context.transport.readRoot();
      assert.equal(read.status, "ok");
      const deleted = Object.entries(
        read.status === "ok" ? read.root.records : {},
      ).filter(([id, record]) => id.startsWith("chats/") && record.deleted);
      assert.deepEqual(deleted, [], `remote=${remote}`);
      assert.deepEqual(ids(a), ["c1", "c2", "c3"], `remote=${remote}`);
      assert.deepEqual(ids(b), ["c1", "c2", "c3"], `remote=${remote}`);
    }
  },
};

Object.assign(cases, lostAnswerCases(baseA, baseB));
Object.assign(cases, backgroundWriteCases(baseA, baseB));

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

if (ignoringA && ignoringB)
  cases["one chat and one provider changed at once, server ignores If-Match"] =
    async () => {
      const PROVIDERS = STORAGE_KEYS.provider;
      let hooks: ReturnType<typeof hookedTransport>["hooks"] = {};
      const { a, b } = await pairOn(
        "ignoring",
        [ignoringA, ignoringB],
        undefined,
        (transport) => {
          const hooked = hookedTransport(transport);
          hooks = hooked.hooks;
          return hooked.transport;
        },
      );
      await saveChat(a, "X", [["m1", 1]]);
      await a.set(PROVIDERS, { p: { apiKey: "k0", model: "m0" } });
      await a.sync("edit");
      await tick();
      await b.sync();
      assert.equal(await loadContent(b.context, "chats", "X"), true);
      await b.settle();
      await tick();
      await saveChat(a, "X", [
        ["m1", 1],
        ["a1", 2],
      ]);
      await a.set(PROVIDERS, {
        p: { apiKey: "k0", model: "m0", baseUrl: "https://a.test" },
      });
      await saveChat(b, "X", [
        ["m1", 1],
        ["b1", 3],
      ]);
      await b.set(PROVIDERS, { p: { apiKey: "k0", model: "m-b" } });
      // b read the root before a's write and writes right after it.
      hooks.writeRoot = async () => {
        await a.sync("edit");
        await tick();
      };
      await b.sync("edit");
      const read = await (a.context.transport as Transport).readRoot();
      assert.equal(read.status, "ok");
      if (read.status === "ok")
        assert.deepEqual(
          read.root.records["providers/p"]?.data,
          { model: "m-b" },
          "b's write replaced a's",
        );
      for (let i = 0; i < 2; i++) {
        await tick();
        await a.sync();
        await tick();
        await b.sync();
      }
      for (const on of [a, b]) {
        assert.deepEqual(messages(on, "X"), ["m1", "a1", "b1"], on.name);
        assert.deepEqual(
          on.get<Record<string, unknown>>(PROVIDERS).p,
          { apiKey: "k0", model: "m-b", baseUrl: "https://a.test" },
          on.name,
        );
      }
    };

// On the server that ignores If-Match, where there is one.
Object.assign(
  cases,
  ignoringA && ignoringB
    ? dayOfUseCases(ignoringA, ignoringB)
    : dayOfUseCases(baseA, baseB),
);

const failed: string[] = [];
for (const [name, body] of Object.entries(cases)) {
  const start = log.length;
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed.push(name);
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
if (process.env.SYNC_RESULTS)
  writeFileSync(process.env.SYNC_RESULTS, JSON.stringify({ failed }));
process.exitCode = failed.length ? 1 : 0;
