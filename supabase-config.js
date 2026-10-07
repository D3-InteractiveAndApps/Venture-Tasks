// supabase-config.js
//
// Fill these in ONCE, after you create a free project at supabase.com, and
// the app gains real accounts + cross-device sync. Leave them untouched and
// the app simply runs in local-only mode (same as before) — nothing breaks.
//
// Where to find these values: in your Supabase project, go to
// Project Settings -> API. "Project URL" goes below as SUPABASE_URL,
// and the "anon public" key goes below as SUPABASE_ANON_KEY.
//
// These are NOT secret the way a server API key is secret — the anon key is
// designed to ship inside client-side apps like this one. Row Level Security
// (set up by the SQL in README.md) is what actually keeps one user's data
// private from another, not keeping this key hidden.
//
// See README.md -> "Setting up accounts and cross-device sync" for the full
// setup walkthrough, including the SQL to run.

export const SUPABASE_URL = "https://sfxafzhyxoimuabitkjh.supabase.co/rest/v1/";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeGFmemh5eG9pbXVhYml0a2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTM2MDUsImV4cCI6MjEwNjk2OTYwNX0.Jzpc0JGfyIHXtIGcc6o9ryHrBQ8ZW75tHFHwBqh0aeo";

export function isSupabaseConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.indexOf("supabase.co") !== -1 &&
    SUPABASE_ANON_KEY.length > 20
  );
}
