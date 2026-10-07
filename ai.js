// ai.js — dispatches to whichever provider the user connected in Settings.
// Each provider module makes its API call directly from this browser, using
// a key that is read from localStorage only and never sent anywhere but
// straight to that provider's own API.

import { store } from "./store.js";
import * as claude from "./claude.js";
import * as openai from "./openai.js";
import * as gemini from "./gemini.js";

export const PROVIDERS = { claude, openai, gemini };

export const PROVIDER_LABELS = {
  none: "None",
  claude: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)"
};

export function isConfigured() {
  const s = store.getSettings();
  return !!(s.provider && s.provider !== "none" && PROVIDERS[s.provider] && s.apiKey && s.model);
}

export function currentProviderLabel() {
  const s = store.getSettings();
  return PROVIDER_LABELS[s.provider] || "";
}

export async function ask(prompt, opts) {
  const s = store.getSettings();
  const provider = PROVIDERS[s.provider];
  if (!provider) throw new Error("No AI provider is connected. Open Settings to add one.");
  if (!s.apiKey) throw new Error("No API key saved for " + currentProviderLabel() + ". Open Settings.");
  if (!s.model) throw new Error("No model name set for " + currentProviderLabel() + ". Open Settings.");
  return provider.ask(s.apiKey, s.model, prompt, opts || {});
}

export async function testConnection() {
  const res = await ask('Reply with exactly the single word: OK');
  return res;
}
