import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n";
import { failureReply, replyValue } from "../src/shared/runtime-messages";
import {
  ProviderConsentError,
  USER_ERROR_CODE,
  UserError,
  userErrorText,
} from "../src/shared/user-errors";

test("a provider consent error comes back from a runtime reply with its host", () => {
  const reply = failureReply(new ProviderConsentError("remote", "ai.example"));
  assert.throws(
    () => replyValue(reply, "Test"),
    (error) =>
      error instanceof ProviderConsentError &&
      error.host === "ai.example" &&
      userErrorText(error, getMessages("en-US")).includes("ai.example"),
  );
});

test("a UserError comes back from a runtime reply with its code", () => {
  const reply = failureReply(
    new UserError(USER_ERROR_CODE.bridgeTimeout, "No answer"),
  );
  assert.throws(
    () => replyValue(reply, "Test"),
    (error) =>
      error instanceof UserError &&
      error.code === USER_ERROR_CODE.bridgeTimeout,
  );
});

test("another error comes back as its text", () => {
  assert.throws(
    () => replyValue(failureReply(new Error("boom")), "Test"),
    (error) =>
      error instanceof Error &&
      !(error instanceof UserError) &&
      error.message === "boom",
  );
  assert.throws(() => replyValue(undefined, "Test"), /Test did not respond/);
});
