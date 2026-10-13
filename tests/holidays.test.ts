import assert from "node:assert/strict";
import { test } from "node:test";
import {
  burstHoliday,
  HOLIDAYS,
  holidayOn,
  localDayKey,
  typingPhrases,
} from "../src/shared/holidays";
import { getMessages, i18nRegistry } from "../src/shared/i18n";

// Local dates, as the device sees them.
const on = (year: number, month: number, day: number) =>
  holidayOn(new Date(year, month - 1, day))?.id;

test("holidays fall on their local dates", () => {
  const cases: [number, number, number, string | undefined][] = [
    [2026, 1, 1, "newYear"],
    [2026, 1, 2, undefined],
    [2026, 2, 14, "valentines"],
    [2026, 2, 15, undefined],
    [2026, 3, 8, "womensDay"],
    [2026, 3, 31, "transVisibility"],
    [2026, 4, 1, "aprilFools"],
    [2026, 4, 22, "earthDay"],
    [2026, 5, 31, undefined],
    [2026, 6, 1, "pride"],
    [2026, 6, 15, "pride"],
    [2026, 6, 30, "pride"],
    [2026, 7, 1, undefined],
    [2026, 10, 13, "birthday"],
    [2026, 10, 31, "halloween"],
    [2026, 12, 23, undefined],
    [2026, 12, 24, "christmas"],
    [2026, 12, 25, "christmas"],
    [2026, 12, 26, undefined],
    [2028, 2, 29, undefined],
  ];
  for (const [year, month, day, expected] of cases)
    assert.equal(on(year, month, day), expected, `${year}-${month}-${day}`);
});

test("New Year spans the year boundary, late into the eve", () => {
  assert.equal(holidayOn(new Date(2026, 11, 31, 23, 59))?.id, "newYear");
  assert.equal(holidayOn(new Date(2027, 0, 1, 0, 0))?.id, "newYear");
  assert.equal(holidayOn(new Date(2026, 11, 30, 23, 59)), undefined);
  assert.equal(holidayOn(new Date(2027, 0, 2, 0, 0)), undefined);
});

test("nothing festive on days of mourning", () => {
  // Trans Day of Remembrance.
  for (const year of [2026, 2027, 2030])
    assert.equal(on(year, 11, 20), undefined);
});

test("the switch turns every holiday touch off", () => {
  for (let day = 0; day < 366; day++) {
    const date = new Date(2028, 0, 1 + day);
    assert.equal(holidayOn(date, false), undefined);
    assert.equal(burstHoliday("", date, false), undefined);
  }
  // The typing indicator then shows only the usual phrases.
  assert.deepEqual(typingPhrases(["a", "b"], undefined), ["a", "b"]);
});

test("the burst plays once per local day", () => {
  const halloween = new Date(2026, 9, 31, 9, 30);
  assert.equal(burstHoliday("", halloween)?.id, "halloween");
  assert.equal(burstHoliday("2026-10-30", halloween)?.id, "halloween");
  assert.equal(localDayKey(halloween), "2026-10-31");
  assert.equal(burstHoliday("2026-10-31", halloween), undefined);
  assert.equal(burstHoliday("", new Date(2026, 9, 30)), undefined);
});

test("holiday phrases lead and alternate with the usual ones", () => {
  assert.deepEqual(typingPhrases(["u1", "u2", "u3"], ["h1", "h2"]), [
    "h1",
    "u1",
    "h2",
    "u2",
    "u3",
  ]);
});

test("every holiday has a name and phrases in every language", () => {
  for (const [language, messages] of Object.entries(i18nRegistry))
    for (const { id, colors } of HOLIDAYS) {
      const holiday = messages.themes.holidays[id];
      assert.ok(holiday.name, `${language} ${id}`);
      assert.ok(holiday.phrases.length >= 3, `${language} ${id}`);
      for (const phrase of holiday.phrases)
        assert.match(phrase, /…$/, `${language} ${id}: ${phrase}`);
      assert.ok(colors.length >= 3, id);
    }
  assert.equal(
    getMessages("en-US").themes.holidays.birthday.name.length > 0,
    true,
  );
});
