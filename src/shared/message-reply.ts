import { errorMessage } from "./error-message";

export type MessageReply<T = unknown> =
  { ok: true; value: T } | { ok: false; error: string };

// Answers a runtime message with the outcome of `work`, in the envelope every
// extension page reads.
export function replyWith<T>(
  work: Promise<T>,
  sendResponse: (response: MessageReply<T>) => void,
) {
  work.then(
    (value) => sendResponse({ ok: true, value }),
    (error) => sendResponse({ ok: false, error: errorMessage(error) }),
  );
}
