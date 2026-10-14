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

// --- shared lists (see shared-lists-schema.sql) ---
// One Supabase Realtime channel per shared page this account is a member
// of, keyed by sharedPageId, plus a snapshot of the previous state so
// store changes can be diffed to figure out which shared rows actually
// need pushing. Applying an incoming remote row sets applyingRemoteShared
// so that store-change doesn't get diffed right back out to Supabase.
const sharedChannels = new Map();
let applyingRemoteShared = false;
let prevStateForSharedDiff = null;

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

// --- field mapping: local camelCase <-> shared_* snake_case columns ---

export function sectionToRow(section, sharedPageId) {
  return {
    id: section.id,
    shared_page_id: sharedPageId,
    name: section.name,
    order: section.order || 0,
    color: section.color || null
  };
}

export function rowToSection(row, pageId) {
  return {
    id: row.id,
    pageId: pageId,
    name: row.name,
    order: row.order || 0,
    color: row.color || null,
    createdAt: row.created_at
  };
}

export function taskToRow(task, sharedPageId) {
  return {
    id: task.id,
    shared_page_id: sharedPageId,
    shared_section_id: task.sectionId,
    text: task.text,
    done: !!task.done,
    order: task.order || 0,
    color: task.color || null,
    due_date: task.dueDate || null,
    event_time: task.eventTime || null,
    recurrence: task.recurrence || null,
    is_someday: !!task.isSomeday,
    client: task.client || null,
    value: task.value == null ? null : task.value,
    updated_at: task.updatedAt || new Date().toISOString(),
    completed_at: task.completedAt || null
  };
}

export function rowToTask(row, pageId) {
  return {
    id: row.id,
    pageId: pageId,
    sectionId: row.shared_section_id,
    text: row.text,
    done: !!row.done,
    order: row.order || 0,
    color: row.color || null,
    dueDate: row.due_date || null,
    eventTime: row.event_time || null,
    recurrence: row.recurrence || null,
    isSomeday: !!row.is_someday,
    client: row.client || null,
    value: row.value == null ? null : row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null
  };
}

// Business-field equality — deliberately ignores timestamp fields, which
// can come back from Postgres in a slightly different string format than
// what we sent, and would otherwise make a harmless echo of our own push
// look like a real incoming change.
export function sectionsEqual(a, b) {
  if (!a || !b) return false;
  return a.name === b.name && (a.order || 0) === (b.order || 0) && (a.color || null) === (b.color || null);
}

export function tasksEqual(a, b) {
  if (!a || !b) return false;
  return a.text === b.text && !!a.done === !!b.done && (a.order || 0) === (b.order || 0)
    && (a.color || null) === (b.color || null) && (a.dueDate || null) === (b.dueDate || null)
    && (a.eventTime || null) === (b.eventTime || null)
    && (a.recurrence || null) === (b.recurrence || null) && !!a.isSomeday === !!b.isSomeday
    && (a.client || null) === (b.client || null) && (a.value == null ? null : a.value) === (b.value == null ? null : b.value)
    && a.sectionId === b.sectionId;
}

function sharedPageIdsByPageId(state) {
  const map = {};
  (state.pages || []).forEach((p) => { if (p.sharedPageId) map[p.id] = p.sharedPageId; });
  return map;
}

// Called on every store change. Looks only at sections/tasks that belong
// to a currently-shared page, and pushes just the rows that actually
// changed since the last store notification — an upsert for an added or
// edited row, a delete for a removed one. Personal (unshared) pages are
// completely untouched by this; they continue to go through the normal
// whole-blob push in schedulePush() exactly as before.
async function diffAndPushSharedRows(nextState) {
  if (!client || !session || applyingRemoteShared) { prevStateForSharedDiff = nextState; return; }
  const prevState = prevStateForSharedDiff;
  prevStateForSharedDiff = nextState;
  if (!prevState) return; // nothing to diff against yet

  const sharedByPage = sharedPageIdsByPageId(nextState);
  if (Object.keys(sharedByPage).length === 0) return;

  const prevSections = {}; (prevState.sections || []).forEach((s) => { if (sharedByPage[s.pageId]) prevSections[s.id] = s; });
  const prevTasks = {}; (prevState.tasks || []).forEach((t) => { if (sharedByPage[t.pageId]) prevTasks[t.id] = t; });
  const nextSections = {}; (nextState.sections || []).forEach((s) => { if (sharedByPage[s.pageId]) nextSections[s.id] = s; });
  const nextTasks = {}; (nextState.tasks || []).forEach((t) => { if (sharedByPage[t.pageId]) nextTasks[t.id] = t; });

  const sectionUpserts = [];
  Object.keys(nextSections).forEach((id) => {
    const s = nextSections[id];
    if (!sectionsEqual(prevSections[id], s)) sectionUpserts.push(sectionToRow(s, sharedByPage[s.pageId]));
  });
  const sectionDeleteIds = Object.keys(prevSections).filter((id) => !nextSections[id]);

  const taskUpserts = [];
  Object.keys(nextTasks).forEach((id) => {
    const t = nextTasks[id];
    if (!tasksEqual(prevTasks[id], t)) taskUpserts.push(taskToRow(t, sharedByPage[t.pageId]));
  });
  const taskDeleteIds = Object.keys(prevTasks).filter((id) => !nextTasks[id]);

  try {
    if (sectionUpserts.length) await client.from("shared_sections").upsert(sectionUpserts);
    if (taskUpserts.length) await client.from("shared_tasks").upsert(taskUpserts);
    if (sectionDeleteIds.length) await client.from("shared_sections").delete().in("id", sectionDeleteIds);
    if (taskDeleteIds.length) await client.from("shared_tasks").delete().in("id", taskDeleteIds);
  } catch (e) {
    setStatus({ error: describeError(e) });
  }
}

// Subscribes to realtime changes for one shared page's sections/tasks.
// Safe to call more than once for the same sharedPageId — it replaces
// any existing channel for that id first.
function subscribeSharedPageRealtime(pageId, sharedPageId) {
  if (!client) return;
  const existing = sharedChannels.get(sharedPageId);
  if (existing) { client.removeChannel(existing); sharedChannels.delete(sharedPageId); }

  const applyRemote = (fn) => {
    applyingRemoteShared = true;
    try { fn(); } finally { applyingRemoteShared = false; }
  };

  const ch = client
    .channel("shared_page_" + sharedPageId)
    .on("postgres_changes", { event: "*", schema: "public", table: "shared_sections", filter: "shared_page_id=eq." + sharedPageId }, (payload) => {
      if (payload.eventType === "DELETE") {
        applyRemote(() => currentStore.removeRemoteSection(payload.old.id));
      } else {
        const incoming = rowToSection(payload.new, pageId);
        const current = currentStore.getState().sections.find((s) => s.id === incoming.id);
        if (sectionsEqual(current, incoming)) return;
        applyRemote(() => currentStore.upsertRemoteSection(incoming));
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "shared_tasks", filter: "shared_page_id=eq." + sharedPageId }, (payload) => {
      if (payload.eventType === "DELETE") {
        applyRemote(() => currentStore.removeRemoteTask(payload.old.id));
      } else {
        const incoming = rowToTask(payload.new, pageId);
        const current = currentStore.getState().tasks.find((t) => t.id === incoming.id);
        if (tasksEqual(current, incoming)) return;
        applyRemote(() => currentStore.upsertRemoteTask(incoming));
      }
    })
    .subscribe();
  sharedChannels.set(sharedPageId, ch);
}

function unsubscribeSharedPageRealtime(sharedPageId) {
  const existing = sharedChannels.get(sharedPageId);
  if (existing && client) client.removeChannel(existing);
  sharedChannels.delete(sharedPageId);
}

function unsubscribeAllSharedPages() {
  sharedChannels.forEach((ch) => { if (client) client.removeChannel(ch); });
  sharedChannels.clear();
}

// Re-subscribes every local page already marked as shared — called after
// sign-in, so a device picks back up its shared lists without the user
// having to re-share or re-join anything.
function resubscribeAllSharedPages() {
  const state = currentStore.getState();
  (state.pages || []).forEach((p) => {
    if (p.sharedPageId) subscribeSharedPageRealtime(p.id, p.sharedPageId);
  });
}

function randomInviteCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — easy to read aloud
  const bytes = new Uint8Array(6);
  (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  let code = "";
  for (let i = 0; i < bytes.length; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

// Turns a local page into a shared list: creates the shared_pages row
// (with a fresh invite code), adds this account as its owner member, and
// mirrors every section/task that page currently has. Returns the
// invite code to show the user.
export async function createSharedList(pageId) {
  const supabase = await ensureClient();
  if (!supabase || !session) throw new Error("Sign in first — shared lists need an account.");
  const state = currentStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("That list doesn't exist.");
  if (page.sharedPageId) throw new Error("This list is already shared.");

  const inviteCode = randomInviteCode();
  const { data: sharedPage, error: pageErr } = await supabase
    .from("shared_pages")
    .insert({ owner_user_id: session.user.id, name: page.name, type: page.type, invite_code: inviteCode })
    .select()
    .single();
  if (pageErr) throw new Error(describeError(pageErr));

  const { error: memberErr } = await supabase
    .from("shared_page_members")
    .insert({ shared_page_id: sharedPage.id, user_id: session.user.id, role: "owner", member_email: session.user.email });
  if (memberErr) throw new Error(describeError(memberErr));

  const sections = state.sections.filter((s) => s.pageId === pageId);
  const tasks = state.tasks.filter((t) => t.pageId === pageId);
  if (sections.length) {
    const { error } = await supabase.from("shared_sections").insert(sections.map((s) => sectionToRow(s, sharedPage.id)));
    if (error) throw new Error(describeError(error));
  }
  if (tasks.length) {
    const { error } = await supabase.from("shared_tasks").insert(tasks.map((t) => taskToRow(t, sharedPage.id)));
    if (error) throw new Error(describeError(error));
  }

  currentStore.markPageShared(pageId, sharedPage.id, "owner");
  subscribeSharedPageRealtime(pageId, sharedPage.id);
  return sharedPage.invite_code;
}

// Shared logic for "this account now has access to a shared page it
// doesn't have locally yet" — used both when explicitly joining by
// invite code (joinSharedList) and when passively picking up a page
// someone else gave this account access to, e.g. via the "share this
// list with the calendar's members too?" flow (adoptNewSharedPages).
// Creates the local page, pulls down its current content, marks it
// shared, and subscribes to future changes.
async function adoptSharedPage(sharedPage, role) {
  const supabase = await ensureClient();
  const [{ data: sectionRows, error: secErr }, { data: taskRows, error: taskErr }] = await Promise.all([
    supabase.from("shared_sections").select("*").eq("shared_page_id", sharedPage.id),
    supabase.from("shared_tasks").select("*").eq("shared_page_id", sharedPage.id)
  ]);
  if (secErr) throw new Error(describeError(secErr));
  if (taskErr) throw new Error(describeError(taskErr));

  const localPage = currentStore.addPage(sharedPage.name, sharedPage.type, false);
  const sections = (sectionRows || []).map((r) => rowToSection(r, localPage.id));
  const tasks = (taskRows || []).map((r) => rowToTask(r, localPage.id));
  currentStore.replaceSharedPageContents(localPage.id, sections, tasks);
  currentStore.markPageShared(localPage.id, sharedPage.id, role);
  subscribeSharedPageRealtime(localPage.id, sharedPage.id);
  return localPage;
}

// Joins a shared list by invite code: creates a new local page for it,
// pulls down its current sections/tasks, and subscribes to future
// changes. Returns the new local page.
export async function joinSharedList(code) {
  const supabase = await ensureClient();
  if (!supabase || !session) throw new Error("Sign in first — shared lists need an account.");
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed) throw new Error("Enter an invite code.");

  const { data: sharedPage, error } = await supabase.rpc("redeem_share_code", { code: trimmed });
  if (error) throw new Error(describeError(error));

  return adoptSharedPage(sharedPage, "editor");
}

// Picks up any shared page this account has been given membership on
// (by someone else's add_shared_members_from call — the "share this
// newly-linked list with the calendar's members too?" flow is the only
// place that happens today) that isn't local yet. Called right after
// sign-in, alongside resubscribeAllSharedPages: that function re-syncs
// pages this account already knew about, this one adopts pages it's
// newly been added to. Best-effort — one bad row shouldn't stop the
// others from coming in.
async function adoptNewSharedPages() {
  const supabase = await ensureClient();
  if (!supabase || !session) return;
  const { data: memberRows, error } = await supabase
    .from("shared_page_members")
    .select("shared_page_id, role")
    .eq("user_id", session.user.id);
  if (error || !memberRows || !memberRows.length) return;

  const state = currentStore.getState();
  const knownSharedIds = new Set((state.pages || []).map((p) => p.sharedPageId).filter(Boolean));
  const newOnes = memberRows.filter((m) => !knownSharedIds.has(m.shared_page_id));
  if (!newOnes.length) return;

  const { data: pageRows, error: pagesErr } = await supabase
    .from("shared_pages").select("*").in("id", newOnes.map((m) => m.shared_page_id));
  if (pagesErr || !pageRows) return;

  for (const pageRow of pageRows) {
    const membership = newOnes.find((m) => m.shared_page_id === pageRow.id);
    try {
      await adoptSharedPage(pageRow, (membership && membership.role) || "editor");
    } catch (e) { /* best-effort — one bad row shouldn't block the others */ }
  }
}

// Returns the invite code + how many people are on a shared list, for
// the "already shared" view of the share modal.
export async function getSharedListInfo(pageId) {
  const supabase = await ensureClient();
  const state = currentStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!supabase || !page || !page.sharedPageId) return null;
  const [{ data: pageRow }, { count }] = await Promise.all([
    supabase.from("shared_pages").select("invite_code").eq("id", page.sharedPageId).maybeSingle(),
    supabase.from("shared_page_members").select("user_id", { count: "exact", head: true }).eq("shared_page_id", page.sharedPageId)
  ]);
  return {
    inviteCode: pageRow ? pageRow.invite_code : null,
    memberCount: typeof count === "number" ? count : null,
    role: page.shareRole
  };
}

// Owner-only: permanently stops sharing a list. Deletes the shared_pages
// row (which cascades to members/sections/tasks server-side); the local
// copy of the list stays put and just goes back to being personal.
export async function stopSharingList(pageId) {
  const supabase = await ensureClient();
  const state = currentStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!supabase || !page || !page.sharedPageId) return;
  if (page.shareRole !== "owner") throw new Error("Only the person who shared this list can stop sharing it.");
  const { error } = await supabase.from("shared_pages").delete().eq("id", page.sharedPageId);
  if (error) throw new Error(describeError(error));
  unsubscribeSharedPageRealtime(page.sharedPageId);
  currentStore.unmarkPageShared(pageId);
}

// Non-owner: leaves a shared list. Removes this account's membership
// server-side, then removes the local page (its content remains on the
// server and for every other member — just not on this account anymore).
export async function leaveSharedList(pageId) {
  const supabase = await ensureClient();
  const state = currentStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!supabase || !session || !page || !page.sharedPageId) return;
  const { error } = await supabase.from("shared_page_members").delete()
    .eq("shared_page_id", page.sharedPageId).eq("user_id", session.user.id);
  if (error) throw new Error(describeError(error));
  unsubscribeSharedPageRealtime(page.sharedPageId);
  currentStore.deletePage(pageId);
}

// --- family calendar list-linking (see family-calendar-schema.sql) ---

// Returns the other people a shared calendar is already shared with
// (excluding the caller) — [] when the calendar isn't shared with
// anyone else yet, or isn't shared at all. The UI uses an empty result
// to skip the "share this list with them too?" prompt entirely, since
// there's no one to offer to share with.
export async function getCalendarOtherMembers(calendarPageId) {
  const supabase = await ensureClient();
  const state = currentStore.getState();
  const page = state.pages.find((p) => p.id === calendarPageId);
  if (!supabase || !session || !page || !page.sharedPageId) return [];
  const { data, error } = await supabase
    .from("shared_page_members")
    .select("user_id, member_email")
    .eq("shared_page_id", page.sharedPageId);
  if (error) throw new Error(describeError(error));
  return (data || [])
    .filter((m) => m.user_id !== session.user.id)
    .map((m) => ({ userId: m.user_id, email: m.member_email || "another member" }));
}

// Links a to-do/grocery list to a calendar so its due dates show up on
// the grid. If the calendar is only local (never shared), this is
// purely a local link — there's no one else to sync it to. If the
// calendar IS shared, the list's shared_pages.id is what every member
// resolves back to their own local copy (see resolveLinkedLists), so
// the list has to be shared too before it can show up for anyone but
// the caller — this shares it (as a new shared list of its own) when
// it isn't already. `shareWithMembers` controls only whether the
// calendar's existing members are actually granted access to the list
// (via add_shared_members_from, no new invite code needed) — the
// caller declining still links the list for their own grid, it just
// won't appear on anyone else's until it's shared some other way.
export async function linkListToCalendar(calendarPageId, listPageId, shareWithMembers) {
  const state = currentStore.getState();
  const calendarPage = state.pages.find((p) => p.id === calendarPageId);
  const listPage = state.pages.find((p) => p.id === listPageId);
  if (!calendarPage || calendarPage.type !== "calendar") throw new Error("That calendar doesn't exist.");
  if (!listPage) throw new Error("That list doesn't exist.");

  if (!calendarPage.sharedPageId) {
    currentStore.linkListToCalendar(calendarPageId, listPageId);
    return;
  }

  const supabase = await ensureClient();
  if (!supabase || !session) throw new Error("Sign in first — shared calendars need an account.");

  let listSharedPageId = listPage.sharedPageId;
  if (!listSharedPageId && shareWithMembers) {
    await createSharedList(listPageId);
    const refreshedList = currentStore.getState().pages.find((p) => p.id === listPageId);
    listSharedPageId = refreshedList && refreshedList.sharedPageId;
  }

  currentStore.linkListToCalendar(calendarPageId, listPageId);
  if (!listSharedPageId) return; // local-only list linked to a shared calendar — fine, just not synced to other members

  const { data: calRow, error: calErr } = await supabase
    .from("shared_pages").select("linked_shared_page_ids").eq("id", calendarPage.sharedPageId).maybeSingle();
  if (calErr) throw new Error(describeError(calErr));
  const current = (calRow && calRow.linked_shared_page_ids) || [];
  const nextIds = current.includes(listSharedPageId) ? current : current.concat([listSharedPageId]);
  const { error: setErr } = await supabase.rpc("set_calendar_linked_lists", {
    calendar_shared_page_id: calendarPage.sharedPageId,
    linked_ids: nextIds
  });
  if (setErr) throw new Error(describeError(setErr));

  if (shareWithMembers) {
    const { error: shareErr } = await supabase.rpc("add_shared_members_from", {
      source_shared_page_id: calendarPage.sharedPageId,
      target_shared_page_id: listSharedPageId
    });
    if (shareErr) throw new Error(describeError(shareErr));
  }
}

// Unlinks a list from a calendar — just the "show its due dates here"
// connection, not sharing itself (whoever already has access to the
// list keeps it; use stopSharingList/leaveSharedList for that).
export async function unlinkListFromCalendar(calendarPageId, listPageId) {
  const state = currentStore.getState();
  const calendarPage = state.pages.find((p) => p.id === calendarPageId);
  const listPage = state.pages.find((p) => p.id === listPageId);

  currentStore.unlinkListFromCalendar(calendarPageId, listPageId);
  if (!calendarPage || !calendarPage.sharedPageId || !listPage || !listPage.sharedPageId) return;

  const supabase = await ensureClient();
  if (!supabase || !session) return;
  const { data: calRow, error: calErr } = await supabase
    .from("shared_pages").select("linked_shared_page_ids").eq("id", calendarPage.sharedPageId).maybeSingle();
  if (calErr) throw new Error(describeError(calErr));
  const current = (calRow && calRow.linked_shared_page_ids) || [];
  const nextIds = current.filter((id) => id !== listPage.sharedPageId);
  const { error: setErr } = await supabase.rpc("set_calendar_linked_lists", {
    calendar_shared_page_id: calendarPage.sharedPageId,
    linked_ids: nextIds
  });
  if (setErr) throw new Error(describeError(setErr));
}

// Translates a shared calendar's linked_shared_page_ids (shared_pages
// ids — stable across accounts, unlike local page ids) into this
// account's own local page ids, and stores the result via
// store.setLinkedLists. Call this whenever a calendar page is opened,
// and after sign-in — it's deliberately NOT pushed via realtime, so a
// list someone else just linked can take until this account next opens
// the calendar (or signs in again) to show up. See README.
export async function resolveLinkedLists(calendarPageId) {
  const supabase = await ensureClient();
  const page = currentStore.getState().pages.find((p) => p.id === calendarPageId);
  if (!supabase || !page || !page.sharedPageId || page.type !== "calendar") return;

  const { data: calRow, error } = await supabase
    .from("shared_pages").select("linked_shared_page_ids").eq("id", page.sharedPageId).maybeSingle();
  if (error) throw new Error(describeError(error));
  const sharedIds = (calRow && calRow.linked_shared_page_ids) || [];
  if (!sharedIds.length) { currentStore.setLinkedLists(calendarPageId, []); return; }

  const localIds = sharedIds
    .map((sid) => {
      const local = currentStore.getState().pages.find((p) => p.sharedPageId === sid);
      return local ? local.id : null;
    })
    .filter(Boolean);
  currentStore.setLinkedLists(calendarPageId, localIds);
}

// --- live calendar feed (see live-calendar-schema.sql + the ics-feed
// Edge Function) ---

function randomCalendarToken() {
  const bytes = new Uint8Array(24);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns this account's calendar token, creating one the first time
// it's asked for. The token is the credential for the live feed URL —
// anyone with it can read that account's due dates with no further
// login, so it's never logged and the only way to revoke a leaked link
// is to delete the row and generate a new one (not currently exposed in
// the UI — see README for how to do it by hand if you ever need to).
export async function getOrCreateCalendarToken() {
  const supabase = await ensureClient();
  if (!supabase || !session) throw new Error("Sign in first — the live calendar needs an account.");
  const { data: existing, error: selErr } = await supabase
    .from("calendar_tokens").select("token").eq("user_id", session.user.id).maybeSingle();
  if (selErr) throw new Error(describeError(selErr));
  if (existing && existing.token) return existing.token;

  const token = randomCalendarToken();
  const { data: inserted, error } = await supabase
    .from("calendar_tokens").insert({ token, user_id: session.user.id }).select("token").single();
  if (error) throw new Error(describeError(error));
  return inserted.token;
}

export function calendarFeedUrl(token) {
  return SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/ics-feed?token=" + token;
}

function describeError(e) {
  if (!e) return "Unknown sync error.";
  if (e.message) return e.message;
  return String(e);
}

async function handleSessionChange(newSession) {
  session = newSession || null;
  if (channel && client) { client.removeChannel(channel); channel = null; }

  unsubscribeAllSharedPages();
  if (!session) {
    setStatus({ loggedIn: false, email: null, syncing: false, error: null });
    return;
  }
  setStatus({ loggedIn: true, email: session.user.email, error: null });
  await pullOrSeedRemoteState();
  await adoptNewSharedPages();
  subscribeRealtime();
  resubscribeAllSharedPages();
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

    store.subscribe((nextState) => { schedulePush(); diffAndPushSharedRows(nextState); });
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

// Permanently deletes this account and everything tied to it — see
// account-deletion-schema.sql for exactly what that cascades through
// (app_state, the calendar token, any shared list/calendar this account
// OWNS — which also removes it for everyone else on it, same as Stop
// Sharing — and this account's membership on anything owned by someone
// else). The RPC does the real work server-side; this just signs the
// (now-deleted) session out and wipes the local copy so the browser
// doesn't keep showing data for an account that no longer exists.
export async function deleteMyAccount() {
  const supabase = await ensureClient();
  if (!supabase || !session) throw new Error("Sign in first — there's no account to delete.");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(describeError(error));
  await supabase.auth.signOut();
  currentStore.resetAllLocalData();
}
