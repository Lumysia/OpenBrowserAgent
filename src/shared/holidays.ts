import { THEMES } from "./theme/themes";

// Holiday touches: internationally known days, by this device's local date
// only. Each entry decorates a fixed set of slots: a badge by the empty
// chat's greeting, typing indicator phrases (in the locale files, under
// `themes.holidays.<id>`), and a short burst in `colors` on the first
// message sent that day.

export type HolidayId =
  | "newYear"
  | "valentines"
  | "womensDay"
  | "transVisibility"
  | "aprilFools"
  | "earthDay"
  | "pride"
  | "halloween"
  | "christmas"
  | "birthday";

// `month` is 1-12. No `day`: the whole month; `to`: the last day of a range.
export type DateRule = { month: number; day?: number; to?: number };

export type HolidayBadge =
  | {
      icon:
        | "party"
        | "heart"
        | "flower"
        | "laugh"
        | "earth"
        | "ghost"
        | "tree"
        | "cake";
    }
  | { flag: "trans" | "rainbow" };

export type Holiday = {
  id: HolidayId;
  dates: DateRule[];
  badge: HolidayBadge;
  colors: string[];
};

export const HOLIDAYS: Holiday[] = [
  {
    id: "newYear",
    dates: [
      { month: 12, day: 31 },
      { month: 1, day: 1 },
    ],
    badge: { icon: "party" },
    colors: ["#f2c14e", "#d9d9e8", "#e0a526", "#9fa8ff"],
  },
  {
    id: "valentines",
    dates: [{ month: 2, day: 14 }],
    badge: { icon: "heart" },
    colors: ["#e8457a", "#f59ab5", "#c2185b"],
  },
  {
    id: "womensDay",
    dates: [{ month: 3, day: 8 }],
    badge: { icon: "flower" },
    colors: ["#9c4dcc", "#f4c430", "#e57bb0"],
  },
  {
    id: "transVisibility",
    dates: [{ month: 3, day: 31 }],
    badge: { flag: "trans" },
    colors: THEMES.trans.flag ?? [],
  },
  {
    id: "aprilFools",
    dates: [{ month: 4, day: 1 }],
    badge: { icon: "laugh" },
    colors: ["#ffb300", "#29b6f6", "#ef5350", "#66bb6a"],
  },
  {
    id: "earthDay",
    dates: [{ month: 4, day: 22 }],
    badge: { icon: "earth" },
    colors: ["#2e7d32", "#66bb6a", "#1e88e5"],
  },
  {
    id: "pride",
    dates: [{ month: 6 }],
    badge: { flag: "rainbow" },
    colors: THEMES.rainbow.flag ?? [],
  },
  {
    // The day OpenBrowserAgent 0.1.0 came out.
    id: "birthday",
    dates: [{ month: 10, day: 13 }],
    badge: { icon: "cake" },
    colors: ["#f48fb1", "#90caf9", "#fff176", "#a5d6a7"],
  },
  {
    id: "halloween",
    dates: [{ month: 10, day: 31 }],
    badge: { icon: "ghost" },
    colors: ["#ff8f00", "#8e24aa", "#43a047"],
  },
  {
    id: "christmas",
    dates: [{ month: 12, day: 24, to: 25 }],
    badge: { icon: "tree" },
    colors: ["#c62828", "#2e7d32", "#f9a825"],
  },
];

// Days of mourning: nothing festive, whatever else falls on them.
export const QUIET_DAYS: DateRule[] = [
  // Trans Day of Remembrance.
  { month: 11, day: 20 },
];

function matches(rule: DateRule, date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (rule.month !== month) return false;
  if (rule.day === undefined) return true;
  return day >= rule.day && day <= (rule.to ?? rule.day);
}

// The holiday on the device's local date, if the touches are on.
export function holidayOn(date: Date, enabled = true): Holiday | undefined {
  if (!enabled || QUIET_DAYS.some((rule) => matches(rule, date)))
    return undefined;
  return HOLIDAYS.find((holiday) =>
    holiday.dates.some((rule) => matches(rule, date)),
  );
}

// The holiday whose burst plays now: the first message on a holiday, once
// per local day (`lastDay` is the day it last played).
export function burstHoliday(lastDay: string, date: Date, enabled = true) {
  const holiday = holidayOn(date, enabled);
  return holiday && lastDay !== localDayKey(date) ? holiday : undefined;
}

// The local calendar day, e.g. to remember the day's burst was shown.
export function localDayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The holiday's phrases first, then alternating with the usual ones, so a
// short wait still shows one.
export function typingPhrases(usual: string[], holiday: string[] = []) {
  const phrases: string[] = [];
  for (let index = 0; index < Math.max(usual.length, holiday.length); index++)
    phrases.push(
      ...[holiday[index], usual[index]].filter(
        (phrase): phrase is string => !!phrase,
      ),
    );
  return phrases;
}
