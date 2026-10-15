import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n";
import {
  localExecutionBridgeTestError,
  localExecutionBridgeTestReset,
  localExecutionBridgeTestResult,
} from "../src/shared/local-execution-bridges";
import {
  errorWithDetail,
  USER_ERROR_CODE,
  UserError,
} from "../src/shared/user-errors";

test("a known bridge test error is stored with its code and shown localized", () => {
  const stored = localExecutionBridgeTestResult(
    new UserError(USER_ERROR_CODE.bridgeTimeout, "No answer in time"),
  );
  assert.equal(stored.lastTestError, "No answer in time");
  assert.equal(stored.lastTestErrorCode, USER_ERROR_CODE.bridgeTimeout);

  const t = getMessages("de-DE");
  const shown = errorWithDetail(
    t.options.localExecutionBridgeTestError,
    localExecutionBridgeTestError(stored),
    t,
  );
  assert.ok(shown.includes(t.display.errors.bridgeTimeout));
  assert.ok(!shown.includes("No answer in time"));
});

test("another bridge test error is shown as its own text", () => {
  const stored = localExecutionBridgeTestResult(new Error("ECONNREFUSED"));
  assert.equal(stored.lastTestErrorCode, undefined);
  assert.equal(localExecutionBridgeTestError(stored), "ECONNREFUSED");
});

test("a passed test or a changed connection clears the stored error", () => {
  const passed = localExecutionBridgeTestResult();
  assert.equal(passed.lastTestError, "");
  assert.equal(passed.lastTestErrorCode, undefined);
  assert.ok(passed.lastTestedAt);
  const reset = localExecutionBridgeTestReset({ hostName: "x" });
  assert.equal(reset.lastTestErrorCode, undefined);
  assert.ok("lastTestErrorCode" in reset);
});
