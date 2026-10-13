// Two-device WebDAV cases of a reply's run seen from another device: the
// partial copy of a long reply, and a reply whose run died.
import assert from "node:assert/strict";
import {
  openChatContent,
  reattachToRun,
  reply,
  storeChat,
  userMessage,
} from "./sync-app-fixture";
import { CHATS, messages, pair, tick } from "./sync-two-devices-helpers";

// Longer than the 15 minutes after which a running chat used to upload.
const LONG_RUN = { updatedAt: Date.now() - 16 * 60_000 };

export function backgroundWriteCases(baseA: string, baseB: string) {
  const urls = [baseA, baseB];
  return {
    async "a long reply: the copy another device closed never replaces the answer"() {
      const { a, b } = await pair("long-reply", urls);
      a.env.runActive = (id) => id === "X";
      await storeChat(
        a,
        "X",
        { messages: [userMessage("u1", 1), reply("a1", 2, "Hel")] },
        LONG_RUN,
      );
      await a.sync("edit");
      await tick();
      await b.sync();
      await openChatContent(b, "X");
      a.env.runActive = () => false;
      await storeChat(a, "X", {
        messages: [userMessage("u1", 1), reply("a1", 2, "Hello world", 3)],
      });
      await a.sync("edit");
      await tick();
      // b opens the chat before its next sync.
      if (b.get(`${CHATS}/X`)) await reattachToRun(b, "X", "a1");
      await b.sync();
      await tick();
      await a.sync();
      await openChatContent(b, "X");
      for (const on of [a, b]) {
        const content = on.get<{ messages: Array<{ content: string }> }>(
          `${CHATS}/X`,
        );
        assert.equal(content?.messages[1]?.content, "Hello world", on.name);
      }
    },

    async "a reply whose run died, replaced on one device and opened on the other: stays replaced"() {
      const { a, b } = await pair("dead-run", urls);
      await storeChat(
        a,
        "X",
        { messages: [userMessage("u1", 1), reply("a1", 2, "Hel")] },
        LONG_RUN,
      );
      await a.sync("edit");
      await tick();
      await b.sync();
      await openChatContent(b, "X");
      await storeChat(a, "X", {
        messages: [userMessage("u1", 1), reply("a2", 3, "Hello", 4)],
      });
      await a.sync("edit");
      await tick();
      await reattachToRun(b, "X", "a1");
      await b.sync();
      await tick();
      await a.sync();
      await openChatContent(b, "X");
      for (const on of [a, b])
        assert.deepEqual(messages(on, "X"), ["u1", "a2"], on.name);
    },
  };
}
