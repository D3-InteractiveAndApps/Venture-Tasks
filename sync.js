// sync.js
//
// Optional cloud sync, built on Supabase (auth + a tiny Postgres database).
// Off by default: if js/supabase-config.js hasn't been filled in, every
// function here is a safe no-op and the app behaves exactly as it did
// without this file. See README.md for the one-time setup.
//
// How it works once configured:
//   - Each signed-in user has exactly one row in the `app_state` table,
//     holding their entire sections+tasks state as a single JSON blob.
//   - On sign-in, we pull that row down (or create it, for a first-time
//     account) and replace the local store's state with it.
//   - After that, every local change is pushed back up (debounced), and a
//     Supabase Realtime subscription pulls down changes made from any other
//     signed-in device/tab, so multiple computers stay in sync.
//   - Conflict handling is intentionally simple: last write wins. There is
//     no merge of concurrent edits from two devices — the most recent save
//     overwrites the row. For a single person using their own account from
//     a couple of computers, that's a reasonable trade-off; it is not
//     built for simultaneous multi-user editing of the same account.

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

const SUPABASE_JS_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const PUSH_DEBOUNCE_MS = 700;

let client = null;
let currentStore = null;
let session = null;
let applyingRemote = false;
let pushTimer = null;
let lastPushedAt = null;
let channel = null;
let initPromise = null;
let pushInFlight = false;
let pushQueued = false;
let pushScheduled = false; // true from schedulePush() until runPush() actually starts

const statusListeners = new Set();
let status = { configured: isSupabaseConfigured(), loggedIn: false, email: null, syncing: false, error: null };

function setStatus(patch) {
  status = Object.assign({}, status, patch);
  statusListeners.forEach((fn) => {
    try { fn(status); } catch (e) { console.error(e); }
  });
}

export function onStatusChange(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

export function getStatus() {
  return status;
}

export function isConfigured() {
  return isSupabaseConfigured();
}

async function ensureClient() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  const mod = await import(SUPABASE_JS_CDN);
  client = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

async function pullOrSeedRemoteState() {
  if (!client || !session) return;
  setStatus({ syncing: true, error: null });
  try {
    const { data, error } = await client
      .from("app_state")
      .select("data, updated_at")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;

    if (data && data.data) {
      applyingRemote = true;
      currentStore.replaceState(data.data);
      applyingRemote = false;
      lastPushedAt = data.updated_at;
    } else {
      // First time this account has signed in anywhere — seed the
      // account's row with whatever is currently in this browser.
      await pushNow();
    }
    setStatus({ syncing: false });
  } catch (e) {
    applyingRemote = false;
    setStatus({ syncing: false, error: describeError(e) });
  }
}

async function pushNow() {
  if (!client || !session || !currentStore) return;
  try {
    const payload = {
      user_id: session.user.id,
      data: currentStore.getState(),
      updated_at: new Date().toISOString()
    };
    // Ask Postgres to hand back the row it actually stored, and use ITS
    // updated_at (not our client-generated guess) as the echo-detection
    // marker below. Postgres can normalize a timestamptz's string
    // representation (precision, offset format) when it's later broadcast
    // over Realtime, so comparing against our own un-normalized string was
    // silently never matching — meaning this device's own push would come
    // back over Realtime looking like a genuine remote change, and get
    // applied via replaceState(), reverting whatever the user had done
    // locally in the meantime (e.g. checking a box, then quickly
    // unchecking it before the echo arrived).
    const { data: rows, error } = await client.from("app_state").upsert(payload, { onConflict: "user_id" }).select("updated_at");
    if (error) throw error;
    const serverUpdatedAt = rows && rows[0] && rows[0].updated_at;
    lastPushedAt = serverUpdatedAt || payload.updated_at;
    setStatus({ syncing: false, error: null });
  } catch (e) {
    setStatus({ syncing: false, error: describeError(e) });
  }
}

// Runs pushes one at a time, never two upserts to the same row in flight at
// once. Without this, a slow earlier push can finish AFTER a faster later
// one, so the stale (earlier) state "wins" at the database and lastPushedAt
// ends up pointing at that stale write — the same revert symptom as above,
// just from the opposite direction (an out-of-order write instead of a
// misidentified echo).
async function runPush() {
  pushScheduled = false;
  if (pushInFlight) { pushQueued = true; return; }
  pushInFlight = true;
  await pushNow();
  pushInFlight = false;
  if (pushQueued) {
    pushQueued = false;
    await runPush(); // whatever's newest in the store by now, not a stale snapshot
  }
}

function schedulePush() {
  if (!session || applyingRemote) return;
  setStatus({ syncing: true });
  clearTimeout(pushTimer);
  pushScheduled = true;
  pushTimer = setTimeout(runPush, PUSH_DEBOUNCE_MS);
}

function subscribeRealtime() {
  if (!client || !session) return;
  if (channel) { client.removeChannel(channel); channel = null; }
  channel = client
    .channel("app_state_" + session.user.id)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_state", filter: "user_id=eq." + session.user.id },
      (payload) => {
        const row = payload.new;
        if (!row || !row.data) return;
        // Ignore the echo of our own most recent push.
        if (row.updated_at === lastPushedAt) return;
        // Belt-and-suspenders: even if the timestamp comparison above
        // somehow doesn't match our own push (see the note in pushNow),
        // an incoming row that's byte-identical to what's already on
        // screen is never worth a replaceState — applying it is a no-op
        // at best, and at worst it stomps a local change made in the
        // instant between this message being sent and received.
        try {
          if (JSON.stringify(row.data) === JSON.stringify(currentStore.getState())) {
            lastPushedAt = row.updated_at;
            return;
          }
        } catch (e) { /* fall through and apply normally */ }
        // A push for a newer local change is still pending or in flight —
        // trust it over this (now-stale) incoming row; our own push will
        // either overwrite this at the database shortly, or already has.
        if (pushScheduled || pushInFlight || pushQueued) return;
        applyingRemote = true;
        currentStore.replaceState(row.data);
        applyingRemote = false;
        lastPushedAt = row.updated_at;
      }
    )
    .subscribe();
}

function describeError(e) {
  if (!e) return "Unknown sync error.";
  if (e.message) return e.message;
  return String(e);
}

async function handleSessionChange(newSession) {
  session = newSession || null;
  if (channel && client) { client.removeChannel(channel); channel = null; }

  if (!session) {
    setStatus({ loggedIn: false, email: null, syncing: false, error: null });
    return;
  }
  setStatus({ loggedIn: true, email: session.user.email, error: null });
  await pullOrSeedRemoteState();
  subscribeRealtime();
}

export async function initSync(store) {
  currentStore = store;
  if (!isSupabaseConfigured()) {
    setStatus({ configured: false });
    return;
  }
  setStatus({ configured: true });

  if (initPromise) return initPromise;
  initPromise = (async () => {
    const supabase = await ensureClient();
    if (!supabase) return;

    const { data } = await supabase.auth.getSession();
    await handleSessionChange(data && data.session);

    supabase.auth.onAuthStateChange((_event, newSession) => {
      handleSessionChange(newSession);
    });

    store.subscribe(() => schedulePush());
  })();
  return initPromise;
}

export async function signUp(email, password) {
  const supabase = await ensureClient();
  if (!supabase) throw new Error("Cloud sync isn't set up yet — see README.md.");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}

export async function signIn(email, password) {
  const supabase = await ensureClient();
  if (!supabase) throw new Error("Cloud sync isn't set up yet — see README.md.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const supabase = await ensureClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}
