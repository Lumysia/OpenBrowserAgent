import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentTimeNote,
  localIsoTime,
  localTimeZone,
} from "../src/shared/local-time";

// Times for the model: local wall time with its offset, readable back.

test("a local time with its offset reads back as the same moment", () => {
  for (const time of [
    Date.UTC(2026, 9, 21, 23, 44, 5),
    Date.UTC(2026, 0, 15, 4, 0, 0),
    Date.UTC(2026, 6, 1, 12, 30, 59),
  ]) {
    const text = localIsoTime(time);
    assert.match(text, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    assert.equal(Date.parse(text), time);
    // The wall time is the local one.
    const date = new Date(time);
    assert.equal(
      text.slice(11, 16),
      `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes(),
      ).padStart(2, "0")}`,
    );
  }
  assert.equal(localIsoTime(Number.NaN), "");
});

test("the current time note gives the weekday, local time and zone", () => {
  const now = new Date(Date.UTC(2026, 9, 21, 23, 44, 5));
  const note = currentTimeNote(now);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  assert.equal(
    note,
    `<current_time>${weekday} ${localIsoTime(now)} (${localTimeZone()})</current_time>`,
  );
});
