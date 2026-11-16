import type {
  AssistantMessage,
  AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import type { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";

// A reply whose connection drops mid-stream is requested again this many
// times, after these waits, before the turn ends with the error. Pi's own
// retries cover only failures before the response starts.
export const MID_STREAM_RESENDS = 2;
const RESEND_BASE_DELAY_MS = 1000;

export function resendDelayMs(resend: number) {
  return RESEND_BASE_DELAY_MS * 2 ** (resend - 1);
}

// Events and messages that replace what an earlier attempt of the same reply
// streamed. Pi's agent loop passes both through by reference (a
// message_update's assistantMessageEvent, a message_end's message), so this
// mark reaches the event consumers in stream order.
const replacing = new WeakSet<object>();

export function replacesEarlierAttempt(value: object) {
  return replacing.has(value);
}

// The events one reply sends to the agent loop across its attempts: one
// start, then the content of the latest attempt. The first event of an
// attempt that replaces content already streamed carries the mark above.
// An attempt that ends in an error before streaming anything keeps what the
// reply has shown, so the transcript matches what the user saw.
export function replyEvents(output: AssistantMessageEventStream) {
  let started = false;
  let shown: AssistantMessage | undefined;
  let replacingShown = false;
  return {
    push(event: AssistantMessageEvent) {
      if (event.type === "start") {
        if (started) return;
        started = true;
      } else if (event.type === "error") {
        if (replacingShown && shown)
          event = {
            ...event,
            error: { ...event.error, content: [...shown.content] },
          };
      } else if (event.type === "done") {
        if (replacingShown) replacing.add(event.message);
      } else {
        if (replacingShown) replacing.add(event);
        replacingShown = false;
        shown = event.partial;
      }
      output.push(event);
    },
    // The request is sent again; its events replace what has been shown.
    resend() {
      replacingShown = shown !== undefined;
    },
    shown: () => shown,
  };
}
