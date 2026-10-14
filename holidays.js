// holidays.js — a small, fixed list of commonly-observed US holidays,
// computed client-side with plain date math (no API, no yearly data file
// to maintain, works for any year including ones far in the future/past).
// Pure functions only — no DOM, easy to unit test on its own.

// nth weekday of a month, e.g. "3rd Monday of January" (MLK Day) or
// "4th Thursday of November" (Thanksgiving). month is 0-indexed, weekday
// is 0=Sunday..6=Saturday, n is 1-5.
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(year, month, day);
}

// The LAST occurrence of a weekday in a month, e.g. "last Monday of May"
// (Memorial Day) — there's no fixed n for this one since months don't all
// have a 5th occurrence of every weekday.
function lastWeekdayOfMonth(year, month, weekday) {
  const lastOfMonth = new Date(year, month + 1, 0);
  const lastWeekday = lastOfMonth.getDay();
  const back = (lastWeekday - weekday + 7) % 7;
  return new Date(year, month, lastOfMonth.getDate() - back);
}

// Easter Sunday (Western/Gregorian) via the Anonymous Gregorian algorithm
// (aka Meeus/Jones/Butcher) — the standard closed-form computation, not a
// lookup table, so it works for any year.
function computeEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// name: shown on the calendar grid (kept short — it has to fit a ~90px
// cell) and as the full label in the day-overflow popup.
// compute(year): returns that holiday's Date for the given year.
const HOLIDAYS = [
  { name: "New Year's Day", compute: (y) => new Date(y, 0, 1) },
  { name: "MLK Jr. Day", compute: (y) => nthWeekdayOfMonth(y, 0, 1, 3) },
  { name: "Valentine's Day", compute: (y) => new Date(y, 1, 14) },
  { name: "Presidents' Day", compute: (y) => nthWeekdayOfMonth(y, 1, 1, 3) },
  { name: "St. Patrick's Day", compute: (y) => new Date(y, 2, 17) },
  { name: "Easter", compute: (y) => computeEaster(y) },
  { name: "Cinco de Mayo", compute: (y) => new Date(y, 4, 5) },
  { name: "Mother's Day", compute: (y) => nthWeekdayOfMonth(y, 4, 0, 2) },
  { name: "Memorial Day", compute: (y) => lastWeekdayOfMonth(y, 4, 1) },
  { name: "Juneteenth", compute: (y) => new Date(y, 5, 19) },
  { name: "Father's Day", compute: (y) => nthWeekdayOfMonth(y, 5, 0, 3) },
  { name: "Independence Day", compute: (y) => new Date(y, 6, 4) },
  { name: "Labor Day", compute: (y) => nthWeekdayOfMonth(y, 8, 1, 1) },
  { name: "Columbus Day", compute: (y) => nthWeekdayOfMonth(y, 9, 1, 2) },
  { name: "Halloween", compute: (y) => new Date(y, 9, 31) },
  { name: "Veterans Day", compute: (y) => new Date(y, 10, 11) },
  { name: "Thanksgiving", compute: (y) => nthWeekdayOfMonth(y, 10, 4, 4) },
  { name: "Christmas Day", compute: (y) => new Date(y, 11, 25) },
  { name: "New Year's Eve", compute: (y) => new Date(y, 11, 31) }
];

function pad2(n) { return (n < 10 ? "0" : "") + n; }
function toDateStr(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

const yearCache = {};

// { "YYYY-MM-DD": "Holiday Name" } for one calendar year. Cached per year
// since a month grid is re-rendered often but any given year's holidays
// never change.
export function getHolidaysForYear(year) {
  if (yearCache[year]) return yearCache[year];
  const map = {};
  HOLIDAYS.forEach((h) => { map[toDateStr(h.compute(year))] = h.name; });
  yearCache[year] = map;
  return map;
}

// Convenience for a date range that may span a year boundary (a month
// grid showing trailing/leading days from the next/previous year) —
// merges getHolidaysForYear for every distinct year in `years`.
export function getHolidaysForYears(years) {
  const merged = {};
  const seen = new Set();
  years.forEach((y) => {
    if (seen.has(y)) return;
    seen.add(y);
    Object.assign(merged, getHolidaysForYear(y));
  });
  return merged;
}
