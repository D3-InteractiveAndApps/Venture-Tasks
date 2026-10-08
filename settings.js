// settings.js — the Settings modal: account/sync + AI provider connection +
// appearance (font/colors) + export/import.

import { todayStr } from "./dates.js";
import * as sync from "./sync.js";
import { FONT_OPTIONS, applyTheme } from "./theme.js";
import { buildIcsCalendar } from "./ics.js";

export function initSettings(store, ai, onAiChange) {
  const overlay = document.getElementById("settings-overlay");
  const openBtn = document.getElementById("settings-btn");
  const closeBtn = document.getElementById("settings-close");
  const doneBtn = document.getElementById("settings-save");

  const accountNotConfigured = document.getElementById("account-not-configured");
  const accountForm = document.getElementById("account-form");
  const accountLoggedIn = document.getElementById("account-logged-in");
  const accountEmail = document.getElementById("account-email");
  const accountPassword = document.getElementById("account-password");
  const accountSignupBtn = document.getElementById("account-signup-btn");
  const accountSigninBtn = document.getElementById("account-signin-btn");
  const accountAuthStatus = document.getElementById("account-auth-status");
  const accountEmailDisplay = document.getElementById("account-email-display");
  const accountSignoutBtn = document.getElementById("account-signout-btn");
  const accountSyncStatus = document.getElementById("account-sync-status");

  const providerSelect = document.getElementById("ai-provider");
  const providerFields = document.getElementById("ai-provider-fields");
  const keyInput = document.getElementById("ai-key");
  const modelInput = document.getElementById("ai-model");
  const modelLabel = document.getElementById("ai-model-label");
  const modelHelp = document.getElementById("ai-model-help");
  const testBtn = document.getElementById("ai-test-btn");
  const aiStatus = document.getElementById("ai-settings-status");

  const fontSelect = document.getElementById("font-select");
  const themeText = document.getElementById("theme-text");
  const themePanel = document.getElementById("theme-panel");
  const themeBg = document.getElementById("theme-bg");
  const themeResetBtn = document.getElementById("theme-reset-btn");

  const exportBtn = document.getElementById("export-btn");
  const icsExportBtn = document.getElementById("ics-export-btn");
  const importInput = document.getElementById("import-input");
  const dataStatus = document.getElementById("data-settings-status");

  FONT_OPTIONS.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.label;
    fontSelect.appendChild(opt);
  });

  // Fallback swatch colors shown in the color pickers when the user hasn't
  // overridden that slot yet — matches the app's current default light-mode
  // tokens, just so the picker doesn't open on black.
  const THEME_DEFAULTS = { text: "#16171a", panel: "#f8f8f9", bg: "#eaebec" };

  function loadAppearanceFields() {
    const s = store.getSettings();
    fontSelect.value = s.font || "default";
    const theme = s.theme || {};
    themeText.value = theme.text || THEME_DEFAULTS.text;
    themePanel.value = theme.panel || THEME_DEFAULTS.panel;
    themeBg.value = theme.bg || THEME_DEFAULTS.bg;
  }

  function applyAndSaveTheme(patch) {
    const s = store.getSettings();
    const nextTheme = Object.assign({}, s.theme || {}, patch);
    const updated = store.setSettings({ theme: nextTheme });
    applyTheme(updated);
  }

  fontSelect.addEventListener("change", () => {
    const updated = store.setSettings({ font: fontSelect.value });
    applyTheme(updated);
  });
  themeText.addEventListener("input", () => applyAndSaveTheme({ text: themeText.value }));
  themePanel.addEventListener("input", () => applyAndSaveTheme({ panel: themePanel.value }));
  themeBg.addEventListener("input", () => applyAndSaveTheme({ bg: themeBg.value }));
  themeResetBtn.addEventListener("click", () => {
    const updated = store.setSettings({ font: "default", theme: {} });
    applyTheme(updated);
    loadAppearanceFields();
  });

  function syncProviderFields() {
    const val = providerSelect.value;
    if (val === "none") {
      providerFields.hidden = true;
      testBtn.hidden = true;
      return;
    }
    providerFields.hidden = false;
    testBtn.hidden = false;
    const mod = ai.PROVIDERS[val];
    modelLabel.textContent = "Model";
    modelInput.placeholder = mod ? "e.g. " + mod.EXAMPLE_MODEL : "";
    if (mod) {
      modelHelp.innerHTML = "Model names change over time — check "
        + '<a href="' + mod.DOCS_URL + '" target="_blank" rel="noopener">' + ai.PROVIDER_LABELS[val] + "'s model list</a>"
        + " for the current one.";
    } else {
      modelHelp.textContent = "";
    }
  }

  function renderAccountStatus(s) {
    if (!s.configured) {
      accountNotConfigured.hidden = false;
      accountForm.hidden = true;
      accountLoggedIn.hidden = true;
      return;
    }
    accountNotConfigured.hidden = true;
    if (s.loggedIn) {
      accountForm.hidden = true;
      accountLoggedIn.hidden = false;
      accountEmailDisplay.textContent = s.email || "";
      if (s.error) {
        accountSyncStatus.textContent = "Sync error: " + s.error;
        accountSyncStatus.className = "settings-status err";
      } else if (s.syncing) {
        accountSyncStatus.textContent = "Syncing…";
        accountSyncStatus.className = "settings-status";
      } else {
        accountSyncStatus.textContent = "Synced.";
        accountSyncStatus.className = "settings-status ok";
      }
    } else {
      accountForm.hidden = false;
      accountLoggedIn.hidden = true;
    }
  }

  sync.onStatusChange(renderAccountStatus);

  function open() {
    const s = store.getSettings();
    providerSelect.value = s.provider || "none";
    keyInput.value = s.apiKey || "";
    modelInput.value = s.model || "";
    syncProviderFields();
    loadAppearanceFields();
    aiStatus.textContent = "";
    aiStatus.className = "settings-status";
    dataStatus.textContent = "";
    accountAuthStatus.textContent = "";
    accountAuthStatus.className = "settings-status";
    overlay.hidden = false;
  }

  function close() {
    overlay.hidden = true;
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  doneBtn.addEventListener("click", () => {
    const provider = providerSelect.value;
    store.setSettings({
      provider: provider,
      apiKey: provider === "none" ? "" : keyInput.value.trim(),
      model: provider === "none" ? "" : modelInput.value.trim()
    });
    close();
    if (typeof onAiChange === "function") onAiChange();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  providerSelect.addEventListener("change", syncProviderFields);

  async function handleAuth(action, btn) {
    const email = accountEmail.value.trim();
    const password = accountPassword.value;
    if (!email || !password) {
      accountAuthStatus.textContent = "Enter an email and password first.";
      accountAuthStatus.className = "settings-status err";
      return;
    }
    btn.disabled = true;
    accountAuthStatus.textContent = action === "signUp" ? "Creating account…" : "Signing in…";
    accountAuthStatus.className = "settings-status";
    try {
      if (action === "signUp") {
        await sync.signUp(email, password);
        accountAuthStatus.textContent = "Account created. Check your email if confirmation is required, then log in.";
        accountAuthStatus.className = "settings-status ok";
      } else {
        await sync.signIn(email, password);
        accountAuthStatus.textContent = "";
        accountPassword.value = "";
      }
    } catch (e) {
      accountAuthStatus.textContent = (e && e.message) || "Something went wrong.";
      accountAuthStatus.className = "settings-status err";
    } finally {
      btn.disabled = false;
    }
  }

  accountSignupBtn.addEventListener("click", () => handleAuth("signUp", accountSignupBtn));
  accountSigninBtn.addEventListener("click", () => handleAuth("signIn", accountSigninBtn));
  accountSignoutBtn.addEventListener("click", async () => {
    accountSignoutBtn.disabled = true;
    try { await sync.signOut(); } finally { accountSignoutBtn.disabled = false; }
  });

  testBtn.addEventListener("click", async () => {
    const provider = providerSelect.value;
    const key = keyInput.value.trim();
    const model = modelInput.value.trim();
    if (!key || !model) {
      aiStatus.textContent = "Enter a key and a model name first.";
      aiStatus.className = "settings-status err";
      return;
    }
    const mod = ai.PROVIDERS[provider];
    if (!mod) return;
    testBtn.disabled = true;
    aiStatus.textContent = "Testing…";
    aiStatus.className = "settings-status";
    try {
      await mod.ask(key, model, "Reply with exactly the single word: OK", {});
      aiStatus.textContent = "Connected — got a reply back.";
      aiStatus.className = "settings-status ok";
    } catch (e) {
      aiStatus.textContent = "Couldn't connect: " + ((e && e.message) || "unknown error");
      aiStatus.className = "settings-status err";
    } finally {
      testBtn.disabled = false;
    }
  });

  exportBtn.addEventListener("click", () => {
    const json = store.exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "venture-tasks-export-" + todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    dataStatus.textContent = "Exported. Save that file somewhere you'll find it, or import it on another browser/computer.";
  });

  icsExportBtn.addEventListener("click", () => {
    const state = store.getState();
    const ics = buildIcsCalendar(state.pages, state.sections, state.tasks);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "venture-tasks-due-dates-" + todayStr() + ".ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    dataStatus.textContent = "Exported. Import this file into Apple Calendar, Google Calendar, or Outlook to see your due dates there — it's a snapshot, so re-export whenever you want it to catch up.";
  });

  importInput.addEventListener("change", () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJson(String(reader.result));
        dataStatus.textContent = "Imported. Your sections and tasks have been replaced with the file's contents.";
      } catch (e) {
        dataStatus.textContent = "Couldn't import that file: " + ((e && e.message) || "unknown error");
      } finally {
        importInput.value = "";
      }
    };
    reader.onerror = () => { dataStatus.textContent = "Couldn't read that file."; };
    reader.readAsText(file);
  });
}
