// today.js — what belongs in the cross-venture "Today" view, computed
// from the whole store. Pure (no DOM), so the Today panel, the mobile home
// screen, reminders, and the app-icon badge all agree on exactly the same
// list, and so it can be unit tested without a browser.
//
// Four groups:
//   overdue  — to-do tasks not done, due before today
//   dueToday — to-do tasks not done, due today
//   daily    — every "Daily task" (isDaily), done or not. These usually
//              have no due date at all, which is why they used to be
//              dropped from Today entirely. Done ones stay listed (checked)
//              so today's progress is visible and a mis-tap can be undone.
//   events   — Family Calendar events happening today, including today's
//              occurrence of a repeating event (e.g. a weekly "Trash day"
//              created months ago). Events are things that happen, not
//              chores, so a past one is never "overdue".
// Grocery items never appear — they don't have dates.

import { todayStr, occursOn } from "./dates.js";

function dayDiff(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export function computeTodayItems(state, today) {
  const day = today || todayStr();
  const pageById = {};
  (state.pages || []).forEach((p) => { pageById[p.id] = p; });
  const sectionById = {};
  (state.sections || []).forEach((s) => { sectionById[s.id] = s; });

  const overdue = [];
  const dueToday = [];
  const daily = [];
  const events = [];

  (state.tasks || []).forEach((t) => {
    const page = pageById[t.pageId];
    if (!page || page.type === "grocery") return;
    const section = sectionById[t.sectionId] || null;

    if (page.type === "calendar") {
      if (!occursOn(t, day)) return;
      // Only the anchor date is a real, checkable row; any other date is
      // a projection of a repeating event.
      events.push({ task: t, page, section, virtual: t.dueDate !== day });
      return;
    }

    if (t.isDaily) {
      daily.push({ task: t, page, section });
      return;
    }

    if (t.done || !t.dueDate) return;
    const diff = dayDiff(day, t.dueDate);
    if (diff < 0) overdue.push({ task: t, page, section, diff });
    else if (diff === 0) dueToday.push({ task: t, page, section, diff });
  });

  overdue.sort((a, b) => a.diff - b.diff); // most overdue first
  const byPageName = (a, b) => (a.page.name || "").localeCompare(b.page.name || "");
  dueToday.sort(byPageName);
  daily.sort((a, b) => (a.task.done === b.task.done ? byPageName(a, b) : a.task.done ? 1 : -1));
  events.sort((a, b) => (a.task.eventTime || "99:99").localeCompare(b.task.eventTime || "99:99"));

  // "Needs doing" — what the count badge and reminders count. Events are
  // informational, and a daily task already done today isn't pending.
  const pendingCount = overdue.length + dueToday.length + daily.filter((e) => !e.task.done).length;

  return { overdue, dueToday, daily, events, pendingCount };
}
