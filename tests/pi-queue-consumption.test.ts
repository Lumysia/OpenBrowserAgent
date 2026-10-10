import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerResponse } from "node:http";
import type { AiStreamResponse } from "../src/shared/types";
import { runPiAgent } from "../src/background/pi-runtime";
import * as sessions from "../src/background/stream-sessions";
import { providerFixture, reply } from "./provider-fixtures.mjs";
import { installPiRuntimeBrowser, setupPiRuntime } from "./pi-runtime-helpers";

installPiRuntimeBrowser();

for (const firstTurn of ["tool", "text"] as const) {
  test(
    `${firstTurn}: consumed edits/deletes are acknowledged and replayable before the delayed next response`,
    { timeout: 10000 },
    async () => {
      const secondRequest = Promise.withResolvers<ServerResponse>();
      let run: ReturnType<typeof setupPiRuntime>;
      const fixture = await providerFixture((request, response, requests) => {
        if (requests.length === 1) {
          // Edit/Delete are still valid while Pi owns these pending messages.
          sessions.queueMessage(run.session, {
            id: "replacement",
            content: "old draft",
          });
          sessions.queueMessage(run.session, {
            id: "replacement",
            content: "edited instruction",
          });
          sessions.queueMessage(run.session, {
            id: "deleted",
            content: "discard instruction",
          });
          sessions.deleteQueuedMessage(run.session, "deleted");
          sessions.queueMessage(run.session, {
            id: "keep",
            content: "second instruction",
          });
          reply(
            response,
            request.protocol,
            firstTurn === "tool"
              ? {
                  calls: [
                    {
                      id: "tabs",
                      name: "manageTabs",
                      args: { operation: "list" },
                    },
                  ],
                }
              : { text: "First answer" },
          );
        } else if (requests.length === 2) secondRequest.resolve(response);
        else reply(response, request.protocol, { text: "Follow-up answer" });
      });
      run = setupPiRuntime(fixture.baseUrl);
      const seen: AiStreamResponse[] = [];
      const client = {
        postMessage(event: AiStreamResponse) {
          seen.push(event);
        },
      } as chrome.runtime.Port;
      sessions.attachPortToSession(client, run.session, 0);
      const running = runPiAgent(run.options);
      try {
        const response = await secondRequest.promise;
        const acknowledgements = seen.filter(
          (event) => event.type === "queuedMessages",
        );
        assert.equal(
          acknowledgements.length,
          1,
          "consumption must be visible before any next-response bytes",
        );
        const ack = acknowledgements[0];
        assert.deepEqual(
          ack.messages.map(({ id, content }) => ({ id, content })),
          [
            { id: "replacement", content: "edited instruction" },
            { id: "keep", content: "second instruction" },
          ],
        );
        assert.equal(run.session.agent.hasQueuedMessages(), false);
        assert.equal(run.session.currentMessageId, ack.assistantMessageId);
        assert.notEqual(ack.assistantMessageId, "answer");
        assert.ok(
          ack.createdAt >
            Math.max(...ack.messages.map((message) => message.createdAt)),
        );
        const afterAck = seen.filter(
          (event) => event.sequence! > ack.sequence!,
        );
        assert.equal(
          afterAck[0]?.type,
          "metrics",
          "acknowledge before next context-budget work",
        );
        assert.equal(
          afterAck.some((event) => event.type === "chunk"),
          false,
        );
        const submitted = JSON.stringify(fixture.requests[1].body);
        assert.deepEqual(
          fixture.requests[1].body.messages
            .filter((message) => message.role === "user")
            .slice(-2)
            .map((message) => message.content),
          ["edited instruction", "second instruction"],
        );
        assert.doesNotMatch(submitted, /old draft|discard instruction/);

        // Reconnect across the acknowledgement while the provider is silent.
        sessions.detachPort(client);
        const replay: AiStreamResponse[] = [];
        const reconnected = {
          postMessage(event: AiStreamResponse) {
            replay.push(event);
          },
        } as chrome.runtime.Port;
        sessions.attachPortToSession(
          reconnected,
          run.session,
          ack.sequence! - 1,
        );
        assert.deepEqual(replay, [ack, ...afterAck]);
        sessions.detachPort(reconnected);
        const resumed: AiStreamResponse[] = [];
        const resumedClient = {
          postMessage(event: AiStreamResponse) {
            resumed.push(event);
          },
        } as chrome.runtime.Port;
        sessions.attachPortToSession(resumedClient, run.session, ack.sequence);
        assert.deepEqual(resumed, afterAck);

        // A late removal cannot retract submitted input, and must not cause a
        // second acknowledgement that resurrects an apparently pending row.
        sessions.deleteQueuedMessage(run.session, "replacement");
        sessions.deleteQueuedMessage(run.session, "keep");
        // New pending input remains editable/deletable during the same latency.
        sessions.queueMessage(run.session, {
          id: "later",
          content: "later draft",
        });
        sessions.deleteQueuedMessage(run.session, "later");
        sessions.queueMessage(run.session, {
          id: "later-edited",
          content: "later edited instruction",
        });
        sessions.queueMessage(run.session, {
          id: "later-deleted",
          content: "later discard",
        });
        sessions.deleteQueuedMessage(run.session, "later-deleted");
        reply(response, "openai", { text: "Second answer" });
        await running;
        const allAcks = run.session.events.filter(
          (event) => event.type === "queuedMessages",
        );
        assert.equal(allAcks.length, 2);
        assert.deepEqual(
          allAcks.flatMap((event) =>
            event.messages.map((message) => message.id),
          ),
          ["replacement", "keep", "later-edited"],
        );
        assert.notEqual(allAcks[1].assistantMessageId, ack.assistantMessageId);
        assert.doesNotMatch(
          JSON.stringify(fixture.requests[2].body),
          /later draft|later discard/,
        );
        assert.match(
          JSON.stringify(fixture.requests[2].body),
          /later edited instruction/,
        );
        assert.equal(
          resumed.filter((event) => event.type === "queuedMessages").length,
          1,
        );
        assert.deepEqual(
          run.session.events.map((event) => event.sequence),
          run.session.events.map((_, index) => index + 1),
        );
      } finally {
        run.close();
        await running.catch(() => {});
        await fixture.close();
      }
    },
  );
}
