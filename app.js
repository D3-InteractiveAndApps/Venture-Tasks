// app.js — entry point. Wires the data store, the AI dispatcher, the main
// UI and the settings modal together. No build step: this is loaded
// directly by index.html as a native ES module.

import { store } from "./store.js";
import { msUntilNextDailyReset } from "./dates.js";
import * as ai from "./ai.js";
import { initUI } from "./ui.js";
import { initSettings } from "./settings.js";
import { initSync } from "./sync.js";
import { initUndo } from "./undo.js";
import { applyTheme } from "./theme.js";
import { initReminders } from "./reminders.js";

applyTheme(store.getSettings());

const uiApi = initUI(store, ai);
initSettings(store, ai, () => uiApi.refresh());
initSync(store);
initUndo(store);

// Daily tasks (see store.js) reset themselves back to undone. The check in
// store.js when the app loads covers "the app was closed overnight". The
// code below covers "the app stayed open (or asleep in the background)
// across 12:01 AM".
// Daily tasks uncheck at 12:01 AM local time. A timer is set for exactly
// that moment. Phones pause timers while an app sleeps, so the check also
// runs every 30 seconds and whenever the app comes back to the screen:
// open it in the morning and yesterday's check marks are already gone.
function scheduleDailyReset() {
  setTimeout(() => { store.checkDailyReset(); scheduleDailyReset(); }, msUntilNextDailyReset(new Date()) + 250);
}
scheduleDailyReset();
setInterval(() => store.checkDailyReset(), 30 * 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") store.checkDailyReset(); });
window.addEventListener("focus", () => store.checkDailyReset());
window.addEventListener("pageshow", () => store.checkDailyReset());

// Opt-in reminders + app-icon badge (Settings → Reminders). Worked out on
// this device while the app is open — see reminders.js for the limits.
initReminders(store);

// Offline use + "add to home screen" support. Safe to skip silently if
// unavailable (older browsers, or the site served over plain http://).
if ("serviceWorker" in navigator) {
  // When a new version of the app is published, its service worker takes
  // over in the background. Reload once at that point so this screen
  // actually runs the new code. Without this, an installed app (especially
  // on a phone) could keep showing the old version for days. If you're in
  // the middle of typing, the reload waits until the app is next in the
  // background.
  const hadController = !!navigator.serviceWorker.controller;
  let reloadPending = false;
  const reloadNow = () => { if (reloadPending) { reloadPending = false; window.location.reload(); } };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloadPending) return;
    reloadPending = true;
    const el = document.activeElement;
    const typing = el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.value)) && !el.closest("[hidden]");
    if (!typing) reloadNow();
    else document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") reloadNow(); });
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      // Look for a new version whenever the app comes back to the screen.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
