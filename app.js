// app.js — entry point. Wires the data store, the AI dispatcher, the main
// UI and the settings modal together. No build step: this is loaded
// directly by index.html as a native ES module.

import { store } from "./store.js";
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

// Daily tasks (see store.js) reset themselves back to undone once the
// calendar day they were completed on has passed. The module-load check
// in store.js already covers "the app was closed overnight" — this covers
// "the app was left open across midnight," by re-checking on an interval
// cheap enough to just leave running. 60s is plenty; it's a no-op scan
// unless the date has actually changed.
setInterval(() => store.checkDailyReset(), 60 * 1000);

// Opt-in reminders + app-icon badge (Settings → Reminders). Worked out on
// this device while the app is open — see reminders.js for the limits.
initReminders(store);

// Offline use + "add to home screen" support. Safe to skip silently if
// unavailable (older browsers, or the site served over plain http://).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
