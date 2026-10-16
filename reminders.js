// reminders.js — notifications and the app-icon badge.
//
// Honest scope: there's no server here, so nothing can wake a fully
// closed app. Reminders are worked out on this device and fire while
// Venture Tasks is open — in the foreground or the background (a minimized
// window, a background tab, an installed app that hasn't been swiped
// away). Three opt-in pieces:
//   • Daily summary — once a day, at or after a chosen time: what's
//     overdue, due today, daily habits left, and today's events.
//   • Event reminders — N minutes before a Family Calendar event that has
//     a time set (including today's occurrence of a repeating one).
//   • App-icon badge — the Today count on the installed app's icon, where
//     the platform supports it (Badging API).
// Everything below `computeDueReminders` is pure and unit tested; the rest
// is the runtime + the Settings UI.

import { computeTodayItems } from "./today.js";
import { todayStr, fmtDate } from "./dates.js";

export const DEFAULT_REMINDERS = { daily: false, dailyTime: "08:00", events: false, eventLead: 15, badge: true };
const SENT_KEY = "ventureTasks:remindersSent";

export function reminderSettings(settings) {
  return Object.assign({}, DEFAULT_REMINDERS, (settings && settings.reminders) || {});
}

function at(dateStr, hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  const d = new Date(dateStr + "T00:00:00");
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function fmtTime(hhmm) {
  const d = at("2000-01-01", hhmm);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function listPreview(entries, max) {
  const names = entries.slice(0, max).map((e) => e.task.text || "Untitled");
  const extra = entries.length - names.length;
  return names.join(", ") + (extra > 0 ? " +" + extra + " more" : "");
}

// Returns [{ key, title, body, tag, silent }] for reminders that are due
// now and haven't been sent yet. `silent` entries are just marked as sent
// (e.g. the daily summary when the app is already in front of you, or a
// day with nothing on it) without showing anything.
export function computeDueReminders(state, settings, now, sent, opts) {
  const r = reminderSettings(settings);
  const nowDate = now || new Date();
  const today = fmtDate(nowDate);
  const already = sent || {};
  const visible = !!(opts && opts.appVisible);
  const out = [];
  const items = computeTodayItems(state, today);

  if (r.daily) {
    const key = "daily:" + today;
    if (!already[key] && nowDate >= at(today, r.dailyTime)) {
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
        body: highlights.length ? listPreview(highlights, 3) : (items.events.length ? listPreview(items.events, 3) : "Enjoy the clear day."),
        // Already looking at the app, or nothing to say: don't buzz.
        silent: nothing || visible
      });
    }
  }

  if (r.events) {
    const lead = Math.max(0, Number(r.eventLead) || 0) * 60000;
    items.events.forEach((e) => {
      if (!e.task.eventTime || e.task.done) return;
      const key = "event:" + e.task.id + ":" + today;
      if (already[key]) return;
      const start = at(today, e.task.eventTime);
      const fireAt = new Date(start.getTime() - lead);
      // Only within the window [lead time before, 10 min after start] —
      // opening the app at 6pm shouldn't fire a reminder for a 9am event.
      if (nowDate < fireAt || nowDate > new Date(start.getTime() + 10 * 60000)) return;
      const mins = Math.round((start - nowDate) / 60000);
      out.push({
        key,
        tag: "vt-event-" + e.task.id,
        title: (e.task.text || "Event") + " — " + fmtTime(e.task.eventTime),
        body: mins > 1 ? "Starts in " + mins + " minutes · " + (e.page.name || "Calendar") : mins >= -1 ? "Starting now · " + (e.page.name || "Calendar") : "Started at " + fmtTime(e.task.eventTime) + " · " + (e.page.name || "Calendar"),
        silent: false
      });
    });
  }
  return out;
}

// ---- runtime ----

function readSent() {
  try { return JSON.parse(window.localStorage.getItem(SENT_KEY) || "{}") || {}; } catch (e) { return {}; }
}
function writeSent(sent) {
  // Keep only the last few days so this never grows.
  const cutoff = fmtDate(new Date(Date.now() - 3 * 86400000));
  const pruned = {};
  Object.keys(sent).forEach((k) => { if ((sent[k] || "") >= cutoff) pruned[k] = sent[k]; });
  try { window.localStorage.setItem(SENT_KEY, JSON.stringify(pruned)); } catch (e) { /* best effort */ }
}

export function notificationSupport() {
  const standalone = (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    notifications: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    badge: "setAppBadge" in navigator,
    standalone,
    isIOS
  };
}

async function show(n) {
  const options = { body: n.body, tag: n.tag, icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" } };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) { await reg.showNotification(n.title, options); return true; }
    }
  } catch (e) { /* fall through */ }
  try { new Notification(n.title, options); return true; } catch (e) { return false; }
}

let lastBadge = null;
function updateBadge(state, settings) {
  if (!("setAppBadge" in navigator)) return;
  const r = reminderSettings(settings);
  const count = r.badge ? computeTodayItems(state).pendingCount : 0;
  if (count === lastBadge) return;
  lastBadge = count;
  try {
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  } catch (e) { /* unsupported in this context */ }
}

export function runReminderCheck(store) {
  const settings = store.getSettings();
  updateBadge(store.getState(), settings);
  if (!("Notification" in window) || Notification.permission !== "granted") return [];
  const sent = readSent();
  const due = computeDueReminders(store.getState(), settings, new Date(), sent, {
    appVisible: document.visibilityState === "visible" && (typeof document.hasFocus !== "function" || document.hasFocus())
  });
  if (!due.length) return due;
  const today = todayStr();
  due.forEach((n) => {
    sent[n.key] = today;
    if (!n.silent) show(n);
  });
  writeSent(sent);
  return due;
}

export function initReminders(store) {
  const check = () => runReminderCheck(store);
  check();
  setInterval(check, 30 * 1000);
  document.addEventListener("visibilitychange", check);
  store.subscribe(() => updateBadge(store.getState(), store.getSettings()));
}

// ---- Settings UI (Settings → Reminders) ----

export function mountReminderSettings(container, store, onChange) {
  container.innerHTML = "";
  const support = notificationSupport();

  const help = document.createElement("p");
  help.className = "settings-help";
  help.textContent = "Get a nudge for what's due without opening the app. Reminders are worked out on this device — there's no server sending them — so they arrive while Venture Tasks is open, even in the background, but can't reach a fully closed app.";
  container.appendChild(help);

  const status = document.createElement("p");
  status.className = "settings-help reminders-status";
  container.appendChild(status);

  function row(labelText, input, extra) {
    const wrap = document.createElement("label");
    wrap.className = "reminder-row";
    wrap.appendChild(input);
    const span = document.createElement("span");
    span.textContent = labelText;
    wrap.appendChild(span);
    if (extra) wrap.appendChild(extra);
    container.appendChild(wrap);
    return wrap;
  }
  const checkbox = (id) => { const c = document.createElement("input"); c.type = "checkbox"; c.id = id; return c; };

  const dailyBox = checkbox("reminder-daily");
  const dailyTime = document.createElement("input");
  dailyTime.type = "time";
  dailyTime.id = "reminder-daily-time";
  dailyTime.className = "reminder-inline-input";
  dailyTime.setAttribute("aria-label", "Daily summary time");
  row("Daily summary at", dailyBox, dailyTime);

  const eventsBox = checkbox("reminder-events");
  const lead = document.createElement("select");
  lead.id = "reminder-event-lead";
  lead.className = "reminder-inline-input";
  lead.setAttribute("aria-label", "How long before an event");
  [[0, "at start time"], [5, "5 min before"], [10, "10 min before"], [15, "15 min before"], [30, "30 min before"], [60, "1 hour before"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = t;
    lead.appendChild(o);
  });
  row("Calendar events with a time,", eventsBox, lead);

  const badgeBox = checkbox("reminder-badge");
  row("Show the Today count on the app icon", badgeBox);

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "secondary-btn";
  testBtn.id = "reminder-test-btn";
  testBtn.textContent = "Send a test notification";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  actions.appendChild(testBtn);
  container.appendChild(actions);

  function refresh() {
    const r = reminderSettings(store.getSettings());
    const s = notificationSupport();
    dailyBox.checked = !!r.daily;
    dailyTime.value = r.dailyTime;
    dailyTime.disabled = !r.daily;
    eventsBox.checked = !!r.events;
    lead.value = String(r.eventLead);
    lead.disabled = !r.events;
    badgeBox.checked = !!r.badge;
    badgeBox.disabled = !s.badge;
    testBtn.hidden = !(r.daily || r.events);
    let msg = "";
    if (!s.notifications) {
      msg = s.isIOS && !s.standalone
        ? "On iPhone and iPad, notifications only work after you add Venture Tasks to your Home Screen (Share → Add to Home Screen, iOS 16.4 or later). Open it from there, then turn reminders on."
        : "This browser doesn't support notifications.";
    } else if (s.permission === "denied") {
      msg = "Notifications are blocked for this site. Allow them in your browser or device settings, then come back here.";
    } else if ((r.daily || r.events) && s.permission !== "granted") {
      msg = "Waiting for permission — your browser should be asking.";
    } else if (r.daily || r.events) {
      msg = "Reminders are on for this device.";
    }
    if (!s.badge) msg += (msg ? " " : "") + "(The app-icon count needs an installed app on a supporting platform.)";
    status.textContent = msg;
    status.hidden = !msg;
    [dailyBox, eventsBox].forEach((b) => { b.disabled = !s.notifications; });
  }

  async function save(patch, wantsPermission) {
    const next = Object.assign(reminderSettings(store.getSettings()), patch);
    store.setSettings({ reminders: next });
    if (wantsPermission && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (e) { /* older Safari: callback form only */ }
    }
    refresh();
    runReminderCheck(store);
    if (typeof onChange === "function") onChange();
  }

  dailyBox.addEventListener("change", () => save({ daily: dailyBox.checked }, dailyBox.checked));
  dailyTime.addEventListener("change", () => save({ dailyTime: dailyTime.value || DEFAULT_REMINDERS.dailyTime }, false));
  eventsBox.addEventListener("change", () => save({ events: eventsBox.checked }, eventsBox.checked));
  lead.addEventListener("change", () => save({ eventLead: Number(lead.value) }, false));
  badgeBox.addEventListener("change", () => save({ badge: badgeBox.checked }, false));
  testBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
    if (Notification.permission !== "granted") { refresh(); return; }
    const items = computeTodayItems(store.getState());
    show({ title: "Venture Tasks reminders are working", body: items.pendingCount ? items.pendingCount + " thing" + (items.pendingCount === 1 ? "" : "s") + " on your plate today." : "Nothing due today.", tag: "vt-test" });
  });

  refresh();
  return refresh;
}
