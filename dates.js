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
  return fmtDate(base);
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
  return "none";
}

export function recurrenceFromValue(val) {
  if (val === "daily") return { unit: "days", interval: 1 };
  if (val === "weekly") return { unit: "weeks", interval: 1 };
  if (val === "monthly") return { unit: "months", interval: 1 };
  return null;
}
