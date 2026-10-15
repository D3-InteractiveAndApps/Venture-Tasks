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
//
// `category` groups the preset for the Settings dropdown (see
// settings.js, which builds one <optgroup> per category) and is purely
// organizational — it has no effect on the derived CSS variables above.
// THEME_CATEGORY_LABELS (below) is the display order and label for each
// group; "general" (classic neutrals with no particular season/occasion)
// comes first, then the four seasons, then the occasion-based groups.
export const THEME_CATEGORY_LABELS = [
  ["general", "Classic"],
  ["spring", "Spring"],
  ["summer", "Summer"],
  ["fall", "Fall"],
  ["winter", "Winter"],
  ["event", "Events"],
  ["hobby", "Hobbies & Interests"]
];

export const THEME_PRESETS = [
  { id: "default", name: "Default", bg: "#eaebec", text: "#16171a", accent: "#e8622c", dark: false, font: "default", category: "general" },
  { id: "midnight", name: "Midnight", bg: "#14151c", text: "#e9eaf0", accent: "#6c8cff", dark: true, font: "default", category: "general" },
  { id: "slate", name: "Slate", bg: "#e4e7eb", text: "#1f2733", accent: "#3a6ea5", dark: false, font: "inter", category: "general" },
  { id: "charcoal", name: "Charcoal", bg: "#1b1d1f", text: "#eceeee", accent: "#d98e4a", dark: true, font: "inter", category: "general" },
  { id: "terminal", name: "Terminal", bg: "#0c120d", text: "#baf2c6", accent: "#4fe06a", dark: true, font: "jetbrains-mono", category: "general" },

  { id: "cherry-blossom", name: "Cherry Blossom", bg: "#fdecf1", text: "#3a1620", accent: "#d9598b", dark: false, font: "nunito", category: "spring" },
  { id: "meadow", name: "Meadow", bg: "#e9f7ea", text: "#16321f", accent: "#3fa35c", dark: false, font: "default", category: "spring" },

  { id: "ocean", name: "Ocean", bg: "#e6f3f7", text: "#10303a", accent: "#1f8fb0", dark: false, font: "inter", category: "summer" },
  { id: "sunset", name: "Sunset", bg: "#2a1a2e", text: "#f3e6f0", accent: "#f2567c", dark: true, font: "nunito", category: "summer" },

  // Fall: all three built specifically around "changing leaves" tones —
  // burnt-orange maple, golden harvest amber, deep brick-red rust — rather
  // than the generic warm-neutral palette the previous fall set leaned on.
  { id: "maple", name: "Maple", bg: "#f7ead3", text: "#3b1f12", accent: "#c84b28", dark: false, font: "lora", category: "fall" },
  { id: "harvest", name: "Harvest", bg: "#2a1810", text: "#f3e2c9", accent: "#e0932f", dark: true, font: "lora", category: "fall" },
  { id: "rust", name: "Rust", bg: "#2b1016", text: "#f2e0df", accent: "#b8432f", dark: true, font: "lora", category: "fall" },

  { id: "blueprint", name: "Blueprint", bg: "#0d1b2b", text: "#d7e6f5", accent: "#4f8fd9", dark: true, font: "jetbrains-mono", category: "winter" },
  { id: "pine", name: "Pine", bg: "#142019", text: "#e3ede6", accent: "#4caf7d", dark: true, font: "default", category: "winter" },

  { id: "birthday-party", name: "Birthday Party", bg: "#fff0f6", text: "#3a1030", accent: "#ff4d8d", dark: false, font: "poppins", category: "event" },
  { id: "wedding-day", name: "Wedding Day", bg: "#faf6ef", text: "#2e2a22", accent: "#c9a227", dark: false, font: "lora", category: "event" },
  { id: "evergreen-holiday", name: "Evergreen Holiday", bg: "#0e2419", text: "#eaf3ec", accent: "#e23d3d", dark: true, font: "lora", category: "event" },

  { id: "retro-arcade", name: "Retro Arcade", bg: "#140a22", text: "#f2e6ff", accent: "#ff2e9a", dark: true, font: "jetbrains-mono", category: "hobby" },
  { id: "stadium-lights", name: "Stadium Lights", bg: "#0f1d33", text: "#eef3fb", accent: "#ffb703", dark: true, font: "space-grotesk", category: "hobby" },
  { id: "home-team", name: "Home Team", bg: "#eef6ea", text: "#122a1c", accent: "#1f8f4f", dark: false, font: "inter", category: "hobby" }
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
