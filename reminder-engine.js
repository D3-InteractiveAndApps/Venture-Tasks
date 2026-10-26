// reminder-engine.js — decides WHICH reminders are due right now.
//
// Pure: no DOM, no storage, no clock of its own. It works entirely in
// wall-clock "YYYY-MM-DDTHH:MM" stamps in the person's own time zone, so
// the exact same code runs in two places and agrees on everything:
//   • on this device (reminders.js), while the app is open, and
//   • on the server (supabase/functions/push-reminders — this file, plus
//     dates.js and today.js, are copied into it by build-push-function.mjs),
//     which pushes reminders to a phone even when the app is closed.
//
// Three kinds of reminder:
//   • Daily summary — once a day at a chosen time.
//   • Calendar events — `remindBefore` on the event (minutes; -1 = never),
//     or, when it isn't set, the "Calendar events" default from Settings
//     (timed events only). An all-day event with its own reminder counts
//     as starting at 9:00. "1 day before" works, so tomorrow is checked too.
//   • To-dos with a "Remind me" time (`remindAt`).

import { computeTodayItems } from "./today.js";
import { occursOn, addDaysStr } from "./dates.js";

export const REMINDER_DEFAULTS = { daily: false, dailyTime: "08:00", events: false, eventLead: 15 };
export const ALL_DAY_REMINDER_TIME = "09:00";
// An event reminder is still worth sending up to this long after the
// start; a to-do reminder up to a day late (say the phone was off).
const EVENT_GRACE_MIN = 10;
const TODO_GRACE_MIN = 24 * 60;

function pad2(n) { return (n < 10 ? "0" : "") + n; }

// "YYYY-MM-DDTHH:MM" for `date` in `timeZone` (an IANA name such as
// "America/Chicago"), or in this device's own zone when none is given.
export function localStamp(date, timeZone) {
  const d = date || new Date();
  if (timeZone) {
    try {
      const parts = {};
      new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      }).formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
      const hour = parts.hour === "24" ? "00" : parts.hour;
      return parts.year + "-" + parts.month + "-" + parts.day + "T" + hour + ":" + parts.minute;
    } catch (e) { /* unknown zone — fall through to UTC */ }
    return d.toISOString().slice(0, 16);
  }
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

// Minutes since the epoch, treating the stamp as if it were UTC — only
// ever used to compare/subtract stamps from the same zone, so that's fine.
export function stampMinutes(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(stamp || "");
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000;
}

export function formatClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return "";
  const h = +m[1];
  return ((h % 12) || 12) + ":" + m[2] + " " + (h < 12 ? "AM" : "PM");
}

function firstLine(note, max) {
  const line = String(note || "").split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

function listPreview(entries, max) {
  const names = entries.slice(0, max).map((e) => e.task.text || "Untitled");
  const extra = entries.length - names.length;
  return names.join(", ") + (extra > 0 ? " +" + extra + " more" : "");
}

function wasSent(sent, key) {
  if (!sent) return false;
  return typeof sent === "function" ? !!sent(key) : !!sent[key];
}

// state     — the app's { pages, sections, tasks }
// prefs     — { daily, dailyTime, events, eventLead } (missing → defaults)
// nowStamp  — "YYYY-MM-DDTHH:MM", the person's local time right now
// sent      — { key: anything } or key => boolean: what already went out
// opts      — { appVisible, dailyMaxLateMin }
// Returns [{ key, tag, title, body, silent, url }]. `silent` ones should be
// recorded as sent without being shown.
export function computeReminders(state, prefs, nowStamp, sent, opts) {
  const p = Object.assign({}, REMINDER_DEFAULTS, prefs || {});
  const o = opts || {};
  const today = nowStamp.slice(0, 10);
  const nowMin = stampMinutes(nowStamp);
  const out = [];
  const pages = (state && state.pages) || [];
  const tasks = (state && state.tasks) || [];
  const pageById = {};
  pages.forEach((pg) => { pageById[pg.id] = pg; });

  // ---- daily summary ----
  if (p.daily) {
    const key = "daily:" + today;
    const dueMin = stampMinutes(today + "T" + (p.dailyTime || REMINDER_DEFAULTS.dailyTime));
    const maxLate = o.dailyMaxLateMin == null ? Infinity : o.dailyMaxLateMin;
    if (!wasSent(sent, key) && nowMin >= dueMin && nowMin - dueMin <= maxLate) {
      const items = computeTodayItems(state, today);
      const undoneDaily = items.daily.filter((e) => !e.task.done);
      const parts = [];
      if (items.overdue.length) parts.push(items.overdue.length + " overdue");
      if (items.dueToday.length) parts.push(items.dueToday.length + " due today");
      if (undoneDaily.length) parts.push(undoneDaily.length + " daily");
      if (items.events.length) parts.push(items.events.length + " event" + (items.events.length === 1 ? "" : "s"));
      const nothing = parts.length === 0;
      const highlights = items.overdue.concat(items.dueToday, undoneDaily);
      out.push({
        key,
        tag: "vt-daily",
        title: "Today: " + (nothing ? "nothing due" : parts.join(" · ")),
        body: (highlights.length ? listPreview(highlights, 3) : (items.events.length ? listPreview(items.events, 3) : "Enjoy the clear day."))
          + ((items.meals || []).length ? "\nTonight: " + items.meals.map((e) => e.task.text || "Dinner").join(", ") : ""),
        silent: nothing || !!o.appVisible,
        url: "./"
      });
    }
  }

  // ---- calendar events (today's, and tomorrow's for "1 day before") ----
  const tomorrow = addDaysStr(today, 1);
  [today, tomorrow].forEach((day) => {
    tasks.forEach((t) => {
      const page = pageById[t.pageId];
      if (!page || page.type !== "calendar" || !t.dueDate) return;
      if (!occursOn(t, day)) return;
      // Only the anchor date is a real, checkable row; a checked-off
      // anchor doesn't silence the series' later dates.
      if (t.done && t.dueDate === day) return;
      let lead;
      const rb = t.remindBefore;
      if (rb === -1 || rb === "-1") return;
      if (rb == null || rb === "") {
        if (!p.events || !t.eventTime) return;
        lead = Math.max(0, Number(p.eventLead) || 0);
      } else {
        lead = Math.max(0, Number(rb) || 0);
      }
      const startTime = t.eventTime || ALL_DAY_REMINDER_TIME;
      const startMin = stampMinutes(day + "T" + startTime);
      const fireMin = startMin - lead;
      if (nowMin < fireMin || nowMin > startMin + EVENT_GRACE_MIN) return;
      const key = "event:" + t.id + ":" + day;
      if (wasSent(sent, key)) return;
      const where = page.name || "Calendar";
      const mins = startMin - nowMin;
      let when;
      if (!t.eventTime) when = day === today ? "Today (all day)" : "Tomorrow (all day)";
      else if (day !== today) when = "Tomorrow at " + formatClock(t.eventTime);
      else if (mins > 90) when = "Today at " + formatClock(t.eventTime);
      else if (mins > 1) when = "Starts in " + mins + " minutes";
      else if (mins >= -1) when = "Starting now";
      else when = "Started at " + formatClock(t.eventTime);
      const note = firstLine(t.note, 90);
      out.push({
        key,
        tag: "vt-event-" + t.id,
        title: (t.text || "Event") + (t.eventTime ? " — " + formatClock(t.eventTime) : ""),
        body: when + " · " + where + (note ? "\n" + note : ""),
        silent: false,
        url: "./"
      });
    });
  });

  // ---- to-dos with a "Remind me" time ----
  tasks.forEach((t) => {
    if (!t.remindAt || t.done) return;
    const page = pageById[t.pageId];
    if (!page) return;
    const at = stampMinutes(t.remindAt);
    if (!isFinite(at) || nowMin < at || nowMin - at > TODO_GRACE_MIN) return;
    const key = "todo:" + t.id + ":" + t.remindAt.slice(0, 16);
    if (wasSent(sent, key)) return;
    let due = "";
    if (t.dueDate) {
      const diff = Math.round((stampMinutes(t.dueDate) - stampMinutes(today)) / 1440);
      due = diff < 0 ? " · overdue" : diff === 0 ? " · due today" : diff === 1 ? " · due tomorrow" : " · due " + t.dueDate;
    }
    const note = firstLine(t.note, 90);
    out.push({
      key,
      tag: "vt-todo-" + t.id,
      title: "⏰ " + (t.text || "Reminder"),
      body: (page.name || "Venture Tasks") + due + (note ? "\n" + note : ""),
      silent: false,
      url: "./"
    });
  });

  return out;
}

