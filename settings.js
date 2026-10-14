// settings.js — the Settings modal: account/sync + AI provider connection +
// appearance (font/colors) + export/import.

import { todayStr } from "./dates.js";
import * as sync from "./sync.js";
import { FONT_OPTIONS, THEME_PRESETS, findPreset, applyTheme } from "./theme.js";
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
  const themePresetSelect = document.getElementById("theme-preset-select");
  const themeText = document.getElementById("theme-text");
  const themeAccent = document.getElementById("theme-accent");
  const themePanel = document.getElementById("theme-panel");
  const themeBg = document.getElementById("theme-bg");
  const themeResetBtn = document.getElementById("theme-reset-btn");

  const exportBtn = document.getElementById("export-btn");
  const icsExportBtn = document.getElementById("ics-export-btn");
  const importInput = document.getElementById("import-input");
  const dataStatus = document.getElementById("data-settings-status");

  const joinShareCode = document.getElementById("join-share-code");
  const joinShareBtn = document.getElementById("join-share-btn");
  const joinShareStatus = document.getElementById("join-share-status");

  const accountDeleteBtn = document.getElementById("account-delete-btn");
  const accountDeleteStatus = document.getElementById("account-delete-status");

  const liveCalendarSection = document.getElementById("live-calendar-section");
  const liveCalendarGenerateBtn = document.getElementById("live-calendar-generate-btn");
  const liveCalendarUrl = document.getElementById("live-calendar-url");
  const liveCalendarActions = document.getElementById("live-calendar-actions");
  const liveCalendarCopyBtn = document.getElementById("live-calendar-copy-btn");
  const liveCalendarStatus = document.getElementById("live-calendar-status");

  FONT_OPTIONS.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.label;
    fontSelect.appendChild(opt);
  });

  // "Custom" (the blank first option) means "whatever's in the color
  // pickers below right now, with no named preset claiming it" — it's
  // what shows whenever the current colors don't exactly match one of
  // the presets anymore (one was tweaked afterward), and it's also
  // what's active after "Reset colors", which follows the system's own
  // light/dark setting rather than forcing either one — unlike the
  // "Default" preset just below it, which is always light regardless of
  // the system setting.
  const customOpt = document.createElement("option");
  customOpt.value = "";
  customOpt.textContent = "Custom / automatic (system light or dark)";
  themePresetSelect.appendChild(customOpt);
  THEME_PRESETS.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    themePresetSelect.appendChild(opt);
  });

  // Fallback swatch colors shown in the color pickers when the user hasn't
  // overridden that slot yet — matches the app's current default light-mode
  // tokens, just so the picker doesn't open on black.
  const THEME_DEFAULTS = { text: "#16171a", panel: "#f8f8f9", bg: "#eaebec", accent: "#e8622c" };

  function loadAppearanceFields() {
    const s = store.getSettings();
    fontSelect.value = s.font || "default";
    themePresetSelect.value = s.themePreset || "";
    const theme = s.theme || {};
    themeText.value = theme.text || THEME_DEFAULTS.text;
    themeAccent.value = theme.accent || THEME_DEFAULTS.accent;
    themePanel.value = theme.panel || THEME_DEFAULTS.panel;
    themeBg.value = theme.bg || THEME_DEFAULTS.bg;
  }

  // Any hand-edit to a single color field means whatever preset was
  // active (if any) no longer applies exactly — stop tracking it as
  // "selected" so the dropdown correctly falls back to "Custom" next
  // time Settings is opened, rather than claiming a preset that's been
  // tweaked is still that preset.
  function applyAndSaveTheme(patch) {
    const s = store.getSettings();
    const nextTheme = Object.assign({}, s.theme || {}, patch);
    const updated = store.setSettings({ theme: nextTheme, themePreset: null });
    applyTheme(updated);
  }

  fontSelect.addEventListener("change", () => {
    const updated = store.setSettings({ font: fontSelect.value, themePreset: null });
    applyTheme(updated);
  });
  themePresetSelect.addEventListener("change", () => {
    const id = themePresetSelect.value;
    if (!id) return; // picking "Custom" itself changes nothing on its own
    const preset = findPreset(id);
    if (!preset) return;
    // A preset replaces the color set wholesale (including dropping any
    // manual "Windows" override, so the panel surface goes back to being
    // derived from the preset's own background) but is still just a
    // starting point — every field below stays editable afterward.
    const nextTheme = { bg: preset.bg, text: preset.text, accent: preset.accent, dark: preset.dark };
    const updated = store.setSettings({ font: preset.font, theme: nextTheme, themePreset: id });
    applyTheme(updated);
    loadAppearanceFields();
  });
  themeText.addEventListener("input", () => applyAndSaveTheme({ text: themeText.value }));
  themeAccent.addEventListener("input", () => applyAndSaveTheme({ accent: themeAccent.value }));
  themePanel.addEventListener("input", () => applyAndSaveTheme({ panel: themePanel.value }));
  themeBg.addEventListener("input", () => applyAndSaveTheme({ bg: themeBg.value }));
  themeResetBtn.addEventListener("click", () => {
    const updated = store.setSettings({ font: "default", theme: {}, themePreset: null });
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
      liveCalendarSection.hidden = true;
      return;
    }
    accountNotConfigured.hidden = true;
    liveCalendarSection.hidden = !s.loggedIn;
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
    joinShareStatus.textContent = "";
    joinShareStatus.className = "settings-status";
    joinShareCode.value = "";
    resetAccountDeleteConfirm();
    liveCalendarStatus.textContent = "";
    liveCalendarStatus.className = "settings-status";
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

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  joinShareBtn.addEventListener("click", async () => {
    joinShareBtn.disabled = true;
    joinShareStatus.textContent = "Joining…";
    joinShareStatus.className = "settings-status";
    try {
      const page = await sync.joinSharedList(joinShareCode.value);
      joinShareStatus.textContent = "Joined — “" + (page.name || "that list") + "” is now one of your pages.";
      joinShareStatus.className = "settings-status ok";
      joinShareCode.value = "";
    } catch (e) {
      joinShareStatus.textContent = (e && e.message) || "Couldn't join that list.";
      joinShareStatus.className = "settings-status err";
    } finally {
      joinShareBtn.disabled = false;
    }
  });
  joinShareCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); joinShareBtn.click(); }
  });

  // Same two-click confirm pattern used for deleting a page/section — a
  // destructive, unrecoverable action gets a real "are you sure" rather
  // than firing on the first click.
  let accountDeleteConfirming = false;
  let accountDeleteRevertTimer = null;
  function resetAccountDeleteConfirm() {
    accountDeleteConfirming = false;
    if (accountDeleteRevertTimer) { clearTimeout(accountDeleteRevertTimer); accountDeleteRevertTimer = null; }
    accountDeleteBtn.classList.remove("confirm");
    accountDeleteBtn.textContent = "Delete my account and data";
    accountDeleteBtn.disabled = false;
  }

  accountDeleteBtn.addEventListener("click", async () => {
    if (!accountDeleteConfirming) {
      accountDeleteConfirming = true;
      accountDeleteBtn.classList.add("confirm");
      accountDeleteBtn.textContent = "Click again to permanently delete everything";
      accountDeleteRevertTimer = setTimeout(resetAccountDeleteConfirm, 5000);
      return;
    }
    clearTimeout(accountDeleteRevertTimer);
    accountDeleteBtn.disabled = true;
    accountDeleteStatus.textContent = "Deleting…";
    accountDeleteStatus.className = "settings-status";
    try {
      await sync.deleteMyAccount();
      accountDeleteStatus.textContent = "Your account and data have been deleted.";
      accountDeleteStatus.className = "settings-status ok";
      resetAccountDeleteConfirm();
      close();
    } catch (e) {
      accountDeleteStatus.textContent = (e && e.message) || "Couldn't delete your account.";
      accountDeleteStatus.className = "settings-status err";
      resetAccountDeleteConfirm();
    }
  });

  liveCalendarGenerateBtn.addEventListener("click", async () => {
    liveCalendarGenerateBtn.disabled = true;
    liveCalendarStatus.textContent = "Generating…";
    liveCalendarStatus.className = "settings-status";
    try {
      const token = await sync.getOrCreateCalendarToken();
      const url = sync.calendarFeedUrl(token);
      liveCalendarUrl.textContent = url;
      liveCalendarUrl.hidden = false;
      liveCalendarActions.hidden = false;
      liveCalendarStatus.textContent = "Add this as a “subscribed” calendar in Apple Calendar, Google Calendar, or Outlook — it'll stay current on its own, including anything from a shared list you're on.";
      liveCalendarStatus.className = "settings-status ok";
    } catch (e) {
      liveCalendarStatus.textContent = (e && e.message) || "Couldn't generate a calendar link.";
      liveCalendarStatus.className = "settings-status err";
    } finally {
      liveCalendarGenerateBtn.disabled = false;
    }
  });

  liveCalendarCopyBtn.addEventListener("click", async () => {
    const ok = await copyToClipboard(liveCalendarUrl.textContent || "");
    liveCalendarStatus.textContent = ok ? "Copied." : "Couldn't copy automatically — select and copy the link above by hand.";
    liveCalendarStatus.className = ok ? "settings-status ok" : "settings-status err";
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
