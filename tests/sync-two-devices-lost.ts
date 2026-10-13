// Two-device WebDAV cases of a root write that reaches the server while its
// answer is lost (the request timeout, the browser closed while waiting).
import assert from "node:assert/strict";
import { loadContent } from "../src/background/sync/service";
import type { Device } from "./sync-fixtures";
import {
  messages,
  pair,
  saveChat,
  tick,
  type FailingFetch,
} from "./sync-two-devices-helpers";

// a's next root write lands, and its answer is lost.
function losingA() {
  const state = { armed: false };
  const fail: FailingFetch = {
    loseAnswer: (method, path) => {
      if (!state.armed || method !== "PUT" || path !== "root.json.gz")
        return false;
      state.armed = false;
      return true;
    },
  };
  return { state, fail };
}

async function opened(on: Device) {
  await loadContent(on.context, "chats", "X");
  await on.settle();
}

export function lostAnswerCases(baseA: string, baseB: string) {
  const urls = [baseA, baseB];
  return {
    async "a root write whose answer is lost: the reply regenerated since stays"() {
      const losing = losingA();
      const { a, b } = await pair("lost-answer", urls, losing.fail);
      const t = Date.now();
      await saveChat(a, "X", [["m0", t]]);
      await a.sync("edit");
      await tick();
      await b.sync();
      await opened(b);
      await saveChat(a, "X", [
        ["m0", t],
        ["r1", t + 1],
      ]);
      losing.state.armed = true;
      await assert.rejects(a.sync("edit"));
      await tick();
      await saveChat(a, "X", [
        ["m0", t],
        ["r2", t + 2],
      ]);
      await a.sync("edit");
      await tick();
      await b.sync();
      await tick();
      await a.sync();
      for (const on of [a, b])
        assert.deepEqual(messages(on, "X"), ["m0", "r2"], on.name);
    },

    async "a root write whose answer is lost, changed on the other device: merged from that write"() {
      const losing = losingA();
      const { a, b } = await pair("lost-answer-merge", urls, losing.fail);
      const t = Date.now();
      await saveChat(a, "X", [["m0", t]]);
      await a.sync("edit");
      await tick();
      await b.sync();
      await opened(b);
      await saveChat(a, "X", [
        ["m0", t],
        ["r1", t + 1],
      ]);
      losing.state.armed = true;
      await assert.rejects(a.sync("edit"));
      await tick();
      await b.sync();
      await opened(b);
      await saveChat(b, "X", [
        ["m0", t],
        ["r1", t + 1],
        ["b2", t + 2],
      ]);
      await b.sync("edit");
      await tick();
      await saveChat(a, "X", [
        ["m0", t],
        ["r2", t + 3],
      ]);
      await a.sync("edit");
      await tick();
      await b.sync();
      await tick();
      await a.sync();
      for (const on of [a, b])
        assert.deepEqual(messages(on, "X"), ["m0", "b2", "r2"], on.name);
    },
  };
}
