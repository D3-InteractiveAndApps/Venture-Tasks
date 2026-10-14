// theme.js — appearance: the font picker, the 25-30 built-in theme
// presets, and the from-scratch custom text/accent/window/background
// color overrides. Settings live in store.js's settings blob
// (settings.font, settings.theme); this module knows how to apply them
// to the page. The presets themselves and the color math that expands
// one into a full set of CSS variables live in themes.js (kept DOM-free
// there so it's easy to unit test on its own) — this file is just the
// DOM-touching half of the same feature.

import { THEME_PRESETS, findPreset, deriveThemeVars } from "./themes.js";

export { THEME_PRESETS, findPreset };

export const FONT_OPTIONS = [
  { id: "default", label: "Default (Archivo + Work Sans)" },
  { id: "inter", label: "Inter" },
  { id: "poppins", label: "Poppins" },
  { id: "lora", label: "Lora" },
  { id: "jetbrains-mono", label: "JetBrains Mono" },
  { id: "space-grotesk", label: "Space Grotesk" },
  { id: "nunito", label: "Nunito" }
];

// Every CSS variable a theme override can set — cleared in full when no
// override is active, so a leftover value from a previous theme/custom
// edit never lingers after a reset or after switching back to "Default".
const THEME_VAR_NAMES = [
  "--bg", "--panel", "--panel-2", "--text", "--muted", "--border",
  "--accent", "--accent-ink", "--done", "--done-bg",
  "--danger", "--danger-bg", "--warn", "--warn-bg"
];

function setOrClear(root, name, value) {
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

// Applies settings.font / settings.theme to the document immediately — no
// reload needed, so a change in the Settings modal is visible right away.
// settings.theme can be a hand-picked preset's colors (copied in wholesale
// when the user picks one from the dropdown) or a from-scratch custom
// override (the individual color pickers) — deriveThemeVars treats both
// exactly the same way, since a preset is really just a starting point
// for the same {bg, text, accent, panel, dark} shape.
export function applyTheme(settings) {
  const root = document.documentElement;
  const font = (settings && settings.font) || "default";
  if (!font || font === "default") delete root.dataset.font;
  else root.dataset.font = font;

  const theme = (settings && settings.theme) || {};
  const derived = deriveThemeVars(theme);
  if (!derived) {
    THEME_VAR_NAMES.forEach((name) => root.style.removeProperty(name));
    root.style.removeProperty("color-scheme");
    return;
  }
  THEME_VAR_NAMES.forEach((name) => setOrClear(root, name, derived[name]));
  root.style.colorScheme = derived.colorScheme;
}
