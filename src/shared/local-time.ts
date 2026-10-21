// Times for the model, in the user's local time with its UTC offset (ISO
// 8601, "2026-10-21T19:43:54-04:00"): unambiguous, readable as local wall
// time, and accepted back by Date.parse.

const pad = (value: number, length = 2) =>
  String(Math.trunc(Math.abs(value))).padStart(length, "0");

export function localIsoTime(time: number | Date) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  // getTimezoneOffset is minutes behind UTC: -240 is UTC+04:00.
  const offset = -date.getTimezoneOffset();
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}${offset < 0 ? "-" : "+"}${pad(offset / 60)}:${pad(offset % 60)}`;
}

export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// The current moment, for the context of the user's latest message (not
// the system prompt, which stays the same between turns to be cached).
export function currentTimeNote(now = new Date()) {
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  return `<current_time>${weekday} ${localIsoTime(now)} (${localTimeZone()})</current_time>`;
}
