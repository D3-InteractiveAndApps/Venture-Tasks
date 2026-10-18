// push.js: "Push to this device", the reminders that still arrive when
// Venture Tasks is fully closed.
//
// The browser gives us a push subscription, which is an address on its
// own push service (Google's for Chrome/Android, Apple's for Safari/iPhone,
// Mozilla's for Firefox). We save that address, plus this device's time zone
// and Settings → Reminders choices, to the account's Supabase. Once a minute
// the push-reminders Edge Function checks what's due and sends it there.
// sw.js turns each message into a notification.
//
// Needs: cloud sync signed in, notification permission, and the server
// pieces (v9-upgrade.sql, the push-reminders function, push-cron.sql).
// On iPhone/iPad, the app must be added to the Home Screen first.

import * as sync from "./sync.js";

const KEY = "ventureTasks:pushEndpoint";

function readEndpoint() { try { return window.localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
function writeEndpoint(v) {
  try { if (v) window.localStorage.setItem(KEY, v); else window.localStorage.removeItem(KEY); } catch (e) { /* best effort */ }
}

export function isPushOnHere() { return !!readEndpoint(); }

export function pushSupport() {
  const hasSW = "serviceWorker" in navigator;
  const hasPush = typeof window.PushManager !== "undefined";
  const hasNotif = "Notification" in window;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  return { supported: hasSW && hasPush && hasNotif, isIOS, standalone, configured: sync.isConfigured() };
}

function timeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
}

function keyBytes(b64url) {
  const s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(buf, b64url) {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  const b = keyBytes(b64url);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error("The app's service worker isn't running — reload the page and try again.")), 8000))
  ]);
  if (!reg || !reg.pushManager) throw new Error("This browser can't receive push messages.");
  return reg;
}

async function subscribeHere(publicKey) {
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for a different server key can't be reused.
  if (sub && sub.options && sub.options.applicationServerKey && !sameKey(sub.options.applicationServerKey, publicKey)) {
    try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  return sub;
}

// Turn push on for this device. `prefs` = Settings → Reminders choices.
export async function enablePush(prefs) {
  const s = pushSupport();
  if (!s.supported) {
    throw new Error(s.isIOS && !s.standalone
      ? "On iPhone and iPad, add Venture Tasks to your Home Screen first (Share → Add to Home Screen), then open it from there."
      : "This browser doesn't support push notifications.");
  }
  if (!sync.getStatus().loggedIn) throw new Error("Sign in first (Settings → Account & sync) — push reminders come from your synced data.");
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* old Safari */ }
  }
  if (Notification.permission !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser or device settings, then try again.");
  const { publicKey } = await sync.callPushFunction({ action: "config" });
  if (!publicKey) throw new Error("The push server didn't send its key — is the push-reminders function deployed?");
  const sub = await subscribeHere(publicKey);
  const j = sub.toJSON();
  await sync.savePushSubscription(j.endpoint, j.keys.p256dh, j.keys.auth, timeZone(), prefs || {});
  writeEndpoint(j.endpoint);
  return j.endpoint;
}

// Turn it off here: forget the server-side registration and the browser's.
export async function disablePush() {
  const endpoint = readEndpoint();
  writeEndpoint("");
  try { await sync.deletePushSubscription(endpoint); } catch (e) { console.warn("push: couldn't remove server registration", e); }
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && reg.pushManager && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    }
  } catch (e) { /* ignore */ }
}

// Keep the server's copy current: new reminder choices or time zone, or a
// browser that quietly rotated its push address. Safe to call often.
let refreshing = null;
export function refreshPush(prefs) {
  if (!isPushOnHere() || !sync.getStatus().loggedIn) return Promise.resolve(false);
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") {
        // Permission was taken away in browser settings: push can't show
        // anything any more, so stop sending.
        await disablePush();
        return false;
      }
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        await enablePush(prefs);
        return true;
      }
      const j = sub.toJSON();
      await sync.savePushSubscription(j.endpoint, j.keys.p256dh, j.keys.auth, timeZone(), prefs || {});
      writeEndpoint(j.endpoint);
      return true;
    } catch (e) {
      console.warn("push refresh:", e);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function sendTestPush() {
  const endpoint = readEndpoint();
  if (!endpoint) throw new Error("Turn on push for this device first.");
  return sync.callPushFunction({ action: "test", endpoint });
}

// Signing out removes this device's registration, so the next person to use
// this browser doesn't get the previous account's reminders.
let hooked = false;
export function initPush(getPrefs) {
  if (hooked) return;
  hooked = true;
  sync.onBeforeSignOut(() => (isPushOnHere() ? disablePush() : null));
  let wasLoggedIn = false;
  sync.onStatusChange((st) => {
    if (st.loggedIn && !wasLoggedIn) refreshPush(getPrefs());
    wasLoggedIn = !!st.loggedIn;
  });
}
