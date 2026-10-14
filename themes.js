// themes.js — the built-in flat-palette themes, plus the pure color math
// that expands each one into a full set of CSS variables. No DOM access
// at all in this file (see theme.js for the part that actually touches
// the page) — easy to unit test on its own.
//
// Each preset only specifies three colors — background, text, and an
// accent — plus whether it reads as a "dark" or "light" theme (which
// picks one of two hand-tuned sets of done/overdue/warning colors) and
// which font pairs with it. Every other variable — the two panel
// surfaces, muted text, borders, and the ink color that sits on top of
// the accent — is derived from those few values at apply time, so adding
// a new theme is one line here, not a dozen hand-tuned colors to keep in
// sync with each other.

export const THEME_PRESETS = [
  { id: "default", name: "Default", bg: "#eaebec", text: "#16171a", accent: "#e8622c", dark: false, font: "default" },
  { id: "midnight", name: "Midnight", bg: "#14151c", text: "#e9eaf0", accent: "#6c8cff", dark: true, font: "default" },
  { id: "slate", name: "Slate", bg: "#e4e7eb", text: "#1f2733", accent: "#3a6ea5", dark: false, font: "inter" },
  { id: "charcoal", name: "Charcoal", bg: "#1b1d1f", text: "#eceeee", accent: "#d98e4a", dark: true, font: "inter" },
  { id: "sunrise", name: "Sunrise", bg: "#fff4e6", text: "#3a2a1a", accent: "#ef7d2d", dark: false, font: "nunito" },
  { id: "sunset", name: "Sunset", bg: "#2a1a2e", text: "#f3e6f0", accent: "#f2567c", dark: true, font: "nunito" },
  { id: "forest", name: "Forest", bg: "#eef3ea", text: "#1f2e1a", accent: "#3f7d3a", dark: false, font: "default" },
  { id: "pine", name: "Pine", bg: "#142019", text: "#e3ede6", accent: "#4caf7d", dark: true, font: "default" },
  { id: "ocean", name: "Ocean", bg: "#e6f3f7", text: "#10303a", accent: "#1f8fb0", dark: false, font: "inter" },
  { id: "deep-sea", name: "Deep Sea", bg: "#0f1f2b", text: "#d9ecf2", accent: "#33b5d6", dark: true, font: "inter" },
  { id: "lavender", name: "Lavender", bg: "#f3eefb", text: "#2e2340", accent: "#8c5fd6", dark: false, font: "poppins" },
  { id: "plum", name: "Plum", bg: "#241526", text: "#ecdff0", accent: "#c06bdc", dark: true, font: "poppins" },
  { id: "rose", name: "Rose", bg: "#fdecef", text: "#3a1620", accent: "#e05577", dark: false, font: "nunito" },
  { id: "wine", name: "Wine", bg: "#250f14", text: "#f0dde1", accent: "#d64c66", dark: true, font: "lora" },
  { id: "mint", name: "Mint", bg: "#e7f7ef", text: "#123327", accent: "#2cb67d", dark: false, font: "default" },
  { id: "emerald", name: "Emerald", bg: "#0e1f19", text: "#dcf0e6", accent: "#35c88f", dark: true, font: "default" },
  { id: "sand", name: "Sand", bg: "#f3ead8", text: "#3a2f1c", accent: "#c08a3e", dark: false, font: "lora" },
  { id: "espresso", name: "Espresso", bg: "#211711", text: "#efe4d9", accent: "#c98a4e", dark: true, font: "lora" },
  { id: "sky", name: "Sky", bg: "#eaf3fb", text: "#15293a", accent: "#2f8fe0", dark: false, font: "space-grotesk" },
  { id: "nebula", name: "Nebula", bg: "#161029", text: "#e6e1f5", accent: "#8a6ff0", dark: true, font: "space-grotesk" },
  { id: "honey", name: "Honey", bg: "#fff6e0", text: "#332700", accent: "#d6a018", dark: false, font: "nunito" },
  { id: "amber-night", name: "Amber Night", bg: "#231a0c", text: "#f2e6c9", accent: "#e0a63a", dark: true, font: "nunito" },
  { id: "seafoam", name: "Seafoam", bg: "#e8f6f3", text: "#0f2e29", accent: "#22a699", dark: false, font: "inter" },
  { id: "cocoa", name: "Cocoa", bg: "#e9ddd2", text: "#3b2a1e", accent: "#8a5a3b", dark: false, font: "lora" },
  { id: "blush", name: "Blush", bg: "#fbeaf0", text: "#3a1b28", accent: "#d9598b", dark: false, font: "poppins" },
  { id: "steel", name: "Steel", bg: "#e2e6ea", text: "#1a2228", accent: "#52708c", dark: false, font: "jetbrains-mono" },
  { id: "terminal", name: "Terminal", bg: "#0c120d", text: "#baf2c6", accent: "#4fe06a", dark: true, font: "jetbrains-mono" },
  { id: "blueprint", name: "Blueprint", bg: "#0d1b2b", text: "#d7e6f5", accent: "#4f8fd9", dark: true, font: "jetbrains-mono" },
  { id: "peach", name: "Peach", bg: "#ffece0", text: "#3a2016", accent: "#f08a52", dark: false, font: "default" },
  { id: "grape-soda", name: "Grape Soda", bg: "#1c1033", text: "#e6def5", accent: "#9a6ef0", dark: true, font: "poppins" }
];

const LIGHT_SEMANTIC = { done: "#4f8a63", doneBg: "#e4efe6", danger: "#c6483a", dangerBg: "#f6e2df", warn: "#b4790f", warnBg: "#f7ecd6" };
const DARK_SEMANTIC = { done: "#7fbe8f", doneBg: "#253226", danger: "#e06655", dangerBg: "#3a2523", warn: "#e0b23d", warnBg: "#3a331e" };

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

// Nudges a color toward white by `amount` (0-1) — used to derive the
// panel surfaces (card background, then its own header/input surface)
// from the page background, so there's still some depth instead of one
// flat color everywhere.
export function lighten(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex({
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount
  });
}

// Linearly interpolates from hexA to hexB by `t` (0 = hexA, 1 = hexB).
// Used to derive muted text and borders as a blend of the theme's text
// and background colors, rather than hand-picking a fourth and fifth
// color for every single theme.
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  });
}

// Standard relative-luminance formula (WCAG), used only to decide
// whether light or dark ink reads better on top of a given accent color.
function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

// Picks readable ink for text/icons sitting on top of an accent-colored
// background — near-black for a bright/light accent, near-white for a
// dark/saturated one.
export function pickInk(hex) {
  return relativeLuminance(hex) > 0.5 ? "#1b1c1f" : "#ffffff";
}

export function findPreset(id) {
  return THEME_PRESETS.find((t) => t.id === id) || null;
}

// Expands a theme spec ({ bg, text, accent, dark, panel? }) into the full
// set of CSS variable values the app actually uses. `panel`, when given,
// overrides the derived card-surface color — this is what keeps the
// app's existing manual "Windows" color picker meaningful on top of a
// preset (or of a from-scratch custom theme); every other variable
// always derives from bg/text/accent/dark. Returns null when there's no
// override active at all (nothing to apply — let the stylesheet's own
// light/dark defaults run instead).
export function deriveThemeVars(theme) {
  const bg = theme && theme.bg;
  if (!bg) return null;
  const text = theme.text || "#16171a";
  const accent = theme.accent || "#e8622c";
  const panel = theme.panel || lighten(bg, 0.12);
  const panel2 = lighten(panel, 0.12);
  const muted = mix(text, bg, 0.4);
  const border = mix(text, bg, 0.88);
  const accentInk = pickInk(accent);
  const semantic = theme.dark ? DARK_SEMANTIC : LIGHT_SEMANTIC;
  return {
    "--bg": bg,
    "--panel": panel,
    "--panel-2": panel2,
    "--text": text,
    "--muted": muted,
    "--border": border,
    "--accent": accent,
    "--accent-ink": accentInk,
    "--done": semantic.done,
    "--done-bg": semantic.doneBg,
    "--danger": semantic.danger,
    "--danger-bg": semantic.dangerBg,
    "--warn": semantic.warn,
    "--warn-bg": semantic.warnBg,
    colorScheme: theme.dark ? "dark" : "light"
  };
}
