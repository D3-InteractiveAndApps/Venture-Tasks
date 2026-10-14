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

applyTheme(store.getSettings());

const uiApi = initUI(store, ai);
initSettings(store, ai, () => uiApi.refresh());
initSync(store);
initUndo(store);

// Offline use + "add to home screen" support. Safe to skip silently if
// unavailable (older browsers, or the site served over plain http://).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
