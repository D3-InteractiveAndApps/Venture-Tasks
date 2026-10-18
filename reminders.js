// reminders.js — notifications and the app-icon badge.
//
// Two ways reminders reach you (Settings → Reminders):
//   • On this device — worked out right here and shown while Venture Tasks
//     is open, in the foreground or background (a minimized window, a
//     background tab, an installed app that hasn't been swiped away).
//   • Push to this device (push.js) — sent by the push-reminders server
//     piece, so they arrive even when the app is fully closed. When push is
//     on for a device, this file stops showing its own copies there, so
//     nothing arrives twice.
// What's due is decided by reminder-engine.js, the same code the server
// runs: the daily summary, calendar events (each event can have its own
// "Remind me", or use the default lead time), and to-dos with a
// "Remind me at" time.

import { computeTodayItems } from "./today.js";
import { todayStr, fmtDate } from "./dates.js";
import { computeReminders, localStamp } from "./reminder-engine.js";
import { isPushOnHere, pushSupport, enablePush, disablePush, refreshPush, sendTestPush, initPush } from "./push.js";
import * as sync from "./sync.js";

export const DEFAULT_REMINDERS = { daily: false, dailyTime: "08:00", events: false, eventLead: 15, badge: true };
const SENT_KEY = "ventureTasks:remindersSent";

export function reminderSettings(settings) {
  return Object.assign({}, DEFAULT_REMINDERS, (settings && settings.reminders) || {});
}

// The part of the settings the push server needs.
export function serverPrefs(settings) {
  const r = reminderSettings(settings);
  return { daily: !!r.daily, dailyTime: r.dailyTime, events: !!r.events, eventLead: Number(r.eventLead) || 0 };
}

// Returns [{ key, title, body, tag, silent }] for reminders that are due
// now and haven't been sent yet. `silent` entries are just marked as sent
// (e.g. the daily summary when the app is already in front of you, or a
// day with nothing on it) without showing anything.
export function computeDueReminders(state, settings, now, sent, opts) {
  return computeReminders(state, serverPrefs(settings), localStamp(now || new Date()), sent || {}, opts);
}

// Asks for notification permission if it hasn't been asked yet — used when
// someone sets a "Remind me" on a single event or to-do.
export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* old Safari */ }
  }
  return Notification.permission;
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
  // Push is on for this device: the server sends these (even when the app
  // is closed), so showing them here as well would double up.
  if (isPushOnHere()) return [];
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
  initPush(() => serverPrefs(store.getSettings()));
  const check = () => runReminderCheck(store);
  check();
  setInterval(check, 30 * 1000);
  document.addEventListener("visibilitychange", check);
  store.subscribe(() => updateBadge(store.getState(), store.getSettings()));
}

// ---- Settings UI (Settings → Reminders) ----

export function mountReminderSettings(container, store, onChange) {
  container.innerHTML = "";

  const help = document.createElement("p");
  help.className = "settings-help";
  help.textContent = "Get a nudge for what's due. Individual events and to-dos can also have their own \"Remind me\" time (in the event editor, or a to-do's ⋯ details).";
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

  // ---- Push to this device ----
  const pushWrap = document.createElement("div");
  pushWrap.className = "reminder-push";
  const pushTitle = document.createElement("p");
  pushTitle.className = "reminder-push-title";
  pushTitle.textContent = "Even when the app is closed";
  pushWrap.appendChild(pushTitle);
  const pushBox = checkbox("reminder-push");
  const pushLabel = document.createElement("label");
  pushLabel.className = "reminder-row";
  pushLabel.appendChild(pushBox);
  const pushSpan = document.createElement("span");
  pushSpan.textContent = "Push reminders to this device";
  pushLabel.appendChild(pushSpan);
  pushWrap.appendChild(pushLabel);
  const pushStatus = document.createElement("p");
  pushStatus.className = "settings-help reminders-push-status";
  pushStatus.id = "reminder-push-status";
  pushWrap.appendChild(pushStatus);
  container.appendChild(pushWrap);

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "secondary-btn";
  testBtn.id = "reminder-test-btn";
  testBtn.textContent = "Send a test notification";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  actions.appendChild(testBtn);
  const testStatus = document.createElement("span");
  testStatus.className = "settings-status";
  testStatus.id = "reminder-test-status";
  actions.appendChild(testStatus);
  container.appendChild(actions);

  let pushBusy = false;
  let pushError = "";

  function refresh() {
    const r = reminderSettings(store.getSettings());
    const s = notificationSupport();
    const ps = pushSupport();
    const st = sync.getStatus();
    const pushOn = isPushOnHere();
    dailyBox.checked = !!r.daily;
    dailyTime.value = r.dailyTime;
    dailyTime.disabled = !r.daily;
    eventsBox.checked = !!r.events;
    lead.value = String(r.eventLead);
    lead.disabled = !r.events;
    badgeBox.checked = !!r.badge;
    badgeBox.disabled = !s.badge;
    testBtn.hidden = !(r.daily || r.events || pushOn);
    testBtn.textContent = pushOn ? "Send a test push" : "Send a test notification";

    let msg = "";
    if (!s.notifications) {
      msg = s.isIOS && !s.standalone
        ? "On iPhone and iPad, notifications only work after you add Venture Tasks to your Home Screen (Share → Add to Home Screen, iOS 16.4 or later). Open it from there, then turn reminders on."
        : "This browser doesn't support notifications.";
    } else if (s.permission === "denied") {
      msg = "Notifications are blocked for this site. Allow them in your browser or device settings, then come back here.";
    } else if ((r.daily || r.events) && s.permission !== "granted") {
      msg = "Waiting for permission — your browser should be asking.";
    } else if (pushOn) {
      msg = "Reminders are on, and pushed to this device by your Venture Tasks server.";
    } else if (r.daily || r.events) {
      msg = "Reminders are on for this device while Venture Tasks is open (even in the background).";
    }
    if (!s.badge) msg += (msg ? " " : "") + "(The app-icon count needs an installed app on a supporting platform.)";
    status.textContent = msg;
    status.hidden = !msg;
    [dailyBox, eventsBox].forEach((b) => { b.disabled = !s.notifications; });

    // Push block
    pushWrap.hidden = !ps.configured;
    pushBox.checked = pushOn;
    let pmsg = "";
    let canToggle = true;
    if (pushBusy) { pmsg = pushOn ? "Turning off…" : "Setting up push…"; canToggle = false; }
    else if (pushError) pmsg = pushError;
    else if (!ps.supported) {
      pmsg = ps.isIOS && !ps.standalone
        ? "Add Venture Tasks to your Home Screen first (Share → Add to Home Screen), then open it from there to turn this on."
        : "This browser can't receive push messages.";
      canToggle = pushOn;
    } else if (!st.loggedIn) {
      pmsg = "Sign in under Account & sync to use this — push reminders are worked out from your synced data.";
      canToggle = pushOn;
    } else if (pushOn) {
      pmsg = "On. Reminders arrive here even when Venture Tasks is closed (checked about once a minute).";
    } else {
      pmsg = "Without this, reminders only arrive while the app is open (even in the background).";
    }
    pushStatus.textContent = pmsg;
    pushStatus.classList.toggle("err", !!pushError && !pushBusy);
    pushBox.disabled = !canToggle;
  }

  async function save(patch, wantsPermission) {
    const next = Object.assign(reminderSettings(store.getSettings()), patch);
    store.setSettings({ reminders: next });
    if (wantsPermission) await ensureNotificationPermission();
    refresh();
    runReminderCheck(store);
    refreshPush(serverPrefs(store.getSettings()));
    if (typeof onChange === "function") onChange();
  }

  dailyBox.addEventListener("change", () => save({ daily: dailyBox.checked }, dailyBox.checked));
  dailyTime.addEventListener("change", () => save({ dailyTime: dailyTime.value || DEFAULT_REMINDERS.dailyTime }, false));
  eventsBox.addEventListener("change", () => save({ events: eventsBox.checked }, eventsBox.checked));
  lead.addEventListener("change", () => save({ eventLead: Number(lead.value) }, false));
  badgeBox.addEventListener("change", () => save({ badge: badgeBox.checked }, false));

  pushBox.addEventListener("change", async () => {
    const want = pushBox.checked;
    pushBusy = true;
    pushError = "";
    testStatus.textContent = "";
    refresh();
    try {
      if (want) await enablePush(serverPrefs(store.getSettings()));
      else await disablePush();
    } catch (e) {
      pushError = (e && e.message) || "Couldn't set up push.";
    }
    pushBusy = false;
    refresh();
    if (typeof onChange === "function") onChange();
  });

  testBtn.addEventListener("click", async () => {
    testStatus.textContent = "";
    testStatus.className = "settings-status";
    if (isPushOnHere()) {
      testBtn.disabled = true;
      testStatus.textContent = "Sending…";
      try {
        const res = await sendTestPush();
        if (res.sent) { testStatus.textContent = "Sent — it should pop up in a few seconds."; testStatus.classList.add("ok"); }
        else { testStatus.textContent = res.error || "The push service didn't accept it. Try turning push off and on again."; testStatus.classList.add("err"); }
      } catch (e) {
        testStatus.textContent = (e && e.message) || "Couldn't reach the push server.";
        testStatus.classList.add("err");
      }
      testBtn.disabled = false;
      return;
    }
    if (!("Notification" in window)) return;
    if ((await ensureNotificationPermission()) !== "granted") { refresh(); return; }
    const items = computeTodayItems(store.getState());
    show({ title: "Venture Tasks reminders are working", body: items.pendingCount ? items.pendingCount + " thing" + (items.pendingCount === 1 ? "" : "s") + " on your plate today." : "Nothing due today.", tag: "vt-test" });
  });

  let unsub = null;
  unsub = sync.onStatusChange(() => { if (container.isConnected) refresh(); else if (unsub) unsub(); });
  refresh();
  return refresh;
}
