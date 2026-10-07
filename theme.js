// theme.js — appearance: the font picker and the custom text/window/background
// color overrides. Settings live in store.js's settings blob (settings.font,
// settings.theme); this module just knows how to apply them to the page.

export const FONT_OPTIONS = [
  { id: "default", label: "Default (Archivo + Work Sans)" },
  { id: "inter", label: "Inter" },
  { id: "poppins", label: "Poppins" },
  { id: "lora", label: "Lora" },
  { id: "jetbrains-mono", label: "JetBrains Mono" },
  { id: "space-grotesk", label: "Space Grotesk" },
  { id: "nunito", label: "Nunito" }
];

function setOrClear(root, name, value) {
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

// Nudges a hex color a bit lighter, used to derive the secondary panel
// surface (card headers, inputs) from the single "window" color the user
// picks, so there's still some depth instead of one flat color everywhere.
function lighten(hex, amount) {
  try {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return hex;
  }
}

// Applies settings.font / settings.theme to the document immediately — no
// reload needed, so a change in the Settings modal is visible right away.
export function applyTheme(settings) {
  const root = document.documentElement;
  const font = (settings && settings.font) || "default";
  if (!font || font === "default") delete root.dataset.font;
  else root.dataset.font = font;

  const theme = (settings && settings.theme) || {};
  setOrClear(root, "--text", theme.text);
  setOrClear(root, "--bg", theme.bg);
  setOrClear(root, "--panel", theme.panel);
  setOrClear(root, "--panel-2", theme.panel ? lighten(theme.panel, 0.12) : null);
}
