import assert from "node:assert/strict";
import test from "node:test";
import { getMessages } from "../src/shared/i18n";
import { formatMessage } from "../src/shared/text";
import { errorWithDetail } from "../src/shared/user-errors";
import { storedErrorReason } from "../src/ui/error-text";

const lead = (t: ReturnType<typeof getMessages>) => t.options.mcpTestError;

test("a test error stored with its lead shows the lead once", () => {
  const en = getMessages("en-US");
  const zh = getMessages("zh-CN");
  const reason = "HTTP 401";
  for (const storedIn of [en, zh]) {
    const stored = formatMessage(storedIn.common.errorDetail, {
      message: lead(storedIn),
      detail: reason,
    });
    assert.equal(storedErrorReason(stored, lead), reason);
    assert.equal(
      errorWithDetail(lead(en), storedErrorReason(stored, lead), en),
      `${lead(en)}: ${reason}`,
    );
  }
  assert.equal(storedErrorReason(lead(zh), lead), "");
  assert.equal(errorWithDetail(lead(en), "", en), lead(en));
});

test("a reason stored alone comes back as it is", () => {
  assert.equal(storedErrorReason("fetch failed", lead), "fetch failed");
});
