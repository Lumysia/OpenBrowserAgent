import { getBrowserApi } from "./browser-api";
import { errorMessage } from "./error-message";
import { UserError, type UserErrorCode } from "./user-errors";

// The reply to a runtime request between extension pages, the background
// and the offscreen document. `code` carries a UserError across, so the
// receiving UI can still show it in its language.
export type RuntimeReply<T = unknown> =
  { ok: true; value?: T } | { ok: false; error: string; code?: UserErrorCode };

export function failureReply(error: unknown): RuntimeReply<never> {
  return error instanceof UserError
    ? { ok: false, error: error.message, code: error.code }
    : { ok: false, error: errorMessage(error) };
}

// Answers a runtime message with what `work` resolves to. Returns true, which
// keeps the message channel open until the reply is sent.
export function respondWith<T>(
  work: Promise<T>,
  sendResponse: (reply: RuntimeReply<T>) => void,
): true {
  work.then(
    (value) => sendResponse({ ok: true, value }),
    (error) => sendResponse(failureReply(error)),
  );
  return true;
}

// The value of a reply; a failure is thrown again, as the UserError it was
// when it had a code.
export function replyValue<T>(
  reply: RuntimeReply<T> | undefined,
  receiver: string,
): T {
  if (!reply) throw new Error(`${receiver} did not respond.`);
  if (!reply.ok)
    throw reply.code
      ? new UserError(reply.code, reply.error)
      : new Error(reply.error);
  return reply.value as T;
}

export async function sendRuntimeRequest<T>(
  message: unknown,
  receiver: string,
): Promise<T> {
  return replyValue(
    (await getBrowserApi().runtime.sendMessage(message)) as
      RuntimeReply<T> | undefined,
    receiver,
  );
}
