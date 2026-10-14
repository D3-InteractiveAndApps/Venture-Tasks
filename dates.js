// dates.js — small date/recurrence helpers shared by the UI and the weekly review.

export const STALE_DAYS = 7;

function pad2(n) { return (n < 10 ? "0" : "") + n; }

export function fmtDate(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

export function todayStr() {
  return fmtDate(new Date());
}

export function daysUntil(dueStr) {
  if (!dueStr) return null;
  const a = new Date(todayStr() + "T00:00:00");
  const b = new Date(dueStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export function daysSince(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export function activityText(days) {
  if (days === null || days === undefined) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return days + "d ago";
}

export function advanceDate(dateStr, recurrence) {
  const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date(todayStr() + "T00:00:00");
  if (recurrence.unit === "days") base.setDate(base.getDate() + recurrence.interval);
  else if (recurrence.unit === "weeks") base.setDate(base.getDate() + 7 * recurrence.interval);
  else if (recurrence.unit === "months") base.setMonth(base.getMonth() + recurrence.interval);
  else if (recurrence.unit === "weekdays") {
    // Step forward a day at a time, skipping Saturday(6)/Sunday(0), until
    // landing on a Mon–Fri date — always moves at least one day forward,
    // so completing it on a Friday correctly lands on the next Monday.
    do { base.setDate(base.getDate() + 1); } while (base.getDay() === 0 || base.getDay() === 6);
  } else if (recurrence.unit === "weekend") {
    // Same idea in reverse: step forward until landing on Sat(6) or Sun(0).
    do { base.setDate(base.getDate() + 1); } while (base.getDay() !== 0 && base.getDay() !== 6);
  } else if (recurrence.unit === "custom" && Array.isArray(recurrence.days) && recurrence.days.length) {
    // One or more specific weekdays (e.g. "every Monday and Thursday").
    // Always moves forward at least one day first, so completing it on
    // one of its own selected days still advances to the NEXT occurrence
    // rather than returning the same date. At most 7 steps to wrap
    // around a full week.
    for (let i = 0; i < 7; i++) {
      base.setDate(base.getDate() + 1);
      if (recurrence.days.includes(base.getDay())) break;
    }
  }
  return fmtDate(base);
}

const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Human-readable description of a recurrence, used for the "Repeats" badge
// tooltip on a task row so hovering it says exactly what pattern is set,
// not just the generic fact that it repeats.
export function recurrenceLabel(recurrence) {
  if (!recurrence) return "";
  if (recurrence.unit === "days") return recurrence.interval === 1 ? "Repeats every day" : "Repeats every " + recurrence.interval + " days";
  if (recurrence.unit === "weeks") return recurrence.interval === 1 ? "Repeats every week" : "Repeats every " + recurrence.interval + " weeks";
  if (recurrence.unit === "months") return recurrence.interval === 1 ? "Repeats every month" : "Repeats every " + recurrence.interval + " months";
  if (recurrence.unit === "weekdays") return "Repeats every weekday (Mon–Fri)";
  if (recurrence.unit === "weekend") return "Repeats on weekends (Sat–Sun)";
  if (recurrence.unit === "custom") {
    const days = Array.isArray(recurrence.days) ? recurrence.days.slice().sort((a, b) => a - b) : [];
    if (!days.length) return "Repeats on custom days (pick which)";
    return "Repeats every " + days.map((d) => WEEKDAY_SHORT_NAMES[d]).join(", ");
  }
  return "Repeats";
}

export function dueBadgeInfo(dueStr) {
  if (!dueStr) return null;
  const diff = daysUntil(dueStr);
  if (diff < 0) return { text: "Overdue " + Math.abs(diff) + "d", cls: "due-danger" };
  if (diff === 0) return { text: "Due today", cls: "due-warn" };
  if (diff === 1) return { text: "Due tomorrow", cls: "due-warn" };
  if (diff <= 3) return { text: "Due in " + diff + "d", cls: "due-warn" };
  return { text: dueStr, cls: "" };
}

export function recurrenceValue(recurrence) {
  if (!recurrence) return "none";
  if (recurrence.unit === "days") return "daily";
  if (recurrence.unit === "weeks") return "weekly";
  if (recurrence.unit === "months") return "monthly";
  if (recurrence.unit === "weekdays") return "weekdays";
  if (recurrence.unit === "weekend") return "weekend";
  if (recurrence.unit === "custom") return "custom";
  return "none";
}

// `days` (an array of 0=Sun..6=Sat) is only meaningful — and only ever
// passed — for val === "custom"; every other value ignores it.
export function recurrenceFromValue(val, days) {
  if (val === "daily") return { unit: "days", interval: 1 };
  if (val === "weekly") return { unit: "weeks", interval: 1 };
  if (val === "monthly") return { unit: "months", interval: 1 };
  if (val === "weekdays") return { unit: "weekdays" };
  if (val === "weekend") return { unit: "weekend" };
  if (val === "custom") return { unit: "custom", days: Array.isArray(days) && days.length ? days.slice().sort((a, b) => a - b) : [] };
  return null;
}
