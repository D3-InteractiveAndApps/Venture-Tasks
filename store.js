// store.js
// All persistence lives in this one module: everything is in the browser's
// localStorage, synchronous, per-device (plus optional cloud sync — see
// sync.js). A simple pub/sub lets app.js re-render whenever data changes.
//
// Data shape:
//   state.pages    — top-level tabs: { id, name, type: "tasks"|"grocery"|"calendar", order,
//                     createdAt, sharedPageId, shareRole: null|"owner"|"editor",
//                     linkedListIds: [] — calendar pages only; other to-do/grocery
//                     pages whose due-dated tasks also show on this calendar's grid }
//   state.sections — belong to a page: { id, pageId, name, order, color, createdAt }
//   state.tasks    — belong to a section: { id, pageId, sectionId, text, done, order,
//                     color, dueDate, eventTime, recurrence, isSomeday, isDaily, client,
//                     value, createdAt, updatedAt, completedAt }
//   (eventTime is a plain "HH:MM" string or null — only ever set on a calendar
//   page's own events, via its quick-add form; everywhere else it's unused.)
//   (isDaily marks a "Daily task" — a single persistent row meant to be
//   checked off once per calendar day, e.g. a daily-posting habit. Unlike
//   recurrence, which spawns a brand-new row each time one's completed,
//   a daily task just resets ITSELF back to undone once the day rolls
//   over — see resetDailyTasks() below. The two are mutually exclusive on
//   any one task; the UI enforces that by clearing whichever one the user
//   isn't actively setting.)
//   state.trash    — recently deleted, newest first: { id, kind: "task"|"item"|"event"|
//                     "section"|"page", label, pageName, itemCount, deletedAt,
//                     page (snapshot or null), sections: [...], tasks: [...] }
//                     — restorable for 30 days (see addToTrash / restoreFromTrash).
// A task's pageId always mirrors its section's pageId; it's kept redundantly
// for simpler filtering.

import { advanceDate, dailyDayOf } from "./dates.js";

// Moves a "YYYY-MM-DDTHH:MM" reminder by however many days a recurring
// task's due date moved (fromDue → toDue). No due date → nothing to
// anchor it to, so the reminder isn't carried over.
export function shiftRemindAt(remindAt, fromDue, toDue) {
  if (!remindAt || !fromDue || !toDue) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(remindAt);
  if (!m) return null;
  const dayMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const delta = Math.round((dayMs(toDue) - dayMs(fromDue)) / 86400000);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta));
  const pad = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + m[4];
}

const DATA_KEY = "ventureTasks:data:v1";
const SETTINGS_KEY = "ventureTasks:settings:v1";
const UNDO_LIMIT = 50;
const DEFAULT_PAGE_NAME = "Professional Tasks";

const SECTION_PALETTE = ["#3d8bff", "#a855f7", "#e0b23d", "#e05f8a", "#2bb6a3", "#8a6d3b"];

// Seeded into every new grocery-type page, matching the category sets most
// grocery-list apps (AnyList, Out of Milk, Google Keep's shopping template)
// ship by default. The user can rename, recolor, reorder, or delete any of
// these the same way as a category they added themselves.
const DEFAULT_GROCERY_CATEGORIES = [
  "Produce", "Dairy & Eggs", "Meat & Seafood", "Bakery", "Frozen",
  "Pantry", "Canned Goods", "Breakfast & Cereal", "Snacks", "Beverages",
  "Condiments & Spices", "Household", "Personal Care"
];

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (e) {
    console.warn("ventureTasks: couldn't read " + key + " from localStorage", e);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("ventureTasks: couldn't write " + key + " to localStorage", e);
    return false;
  }
}

function defaultData() {
  return { pages: [], sections: [], tasks: [], trash: [] };
}

// Recently deleted: every user-initiated delete (a task/event, a whole
// section, a whole page) is moved into state.trash instead of vanishing,
// and can be restored for TRASH_DAYS days. Each entry carries snapshots of
// the page and section it came from, so it can still be restored even if
// its section/page was deleted afterward (they're recreated if missing).
// Deletes that arrive from someone ELSE on a shared list (removeRemote*)
// deliberately skip the trash — that was their action, not yours.
const TRASH_DAYS = 30;
const TRASH_MAX = 200;

function purgeOldTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  const before = state.trash.length;
  state.trash = state.trash.filter((e) => {
    const t = Date.parse(e.deletedAt);
    return isFinite(t) && t >= cutoff;
  });
  return state.trash.length !== before;
}

function addToTrash(entry) {
  state.trash.unshift(Object.assign({ id: uid(), deletedAt: nowIso() }, entry));
  if (state.trash.length > TRASH_MAX) state.trash.length = TRASH_MAX;
}

function cloneJson(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

// Brings any older or externally-sourced data (old single-page localStorage,
// an export file, a row pulled down from Supabase) up to the current
// {pages, sections, tasks} shape. Idempotent — safe to run on already-current
// data.
function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return defaultData();

  let pages = Array.isArray(raw.pages) ? raw.pages.slice() : [];
  let sections = Array.isArray(raw.sections) ? raw.sections.slice() : [];
  let tasks = Array.isArray(raw.tasks) ? raw.tasks.slice() : [];

  if (pages.length === 0) {
    // Old (pre-pages) data, or a brand-new empty store: give everything a
    // single default page so existing sections/tasks aren't orphaned.
    const defaultPage = { id: uid(), name: DEFAULT_PAGE_NAME, type: "tasks", order: 1, sharedPageId: null, shareRole: null, linkedListIds: [], createdAt: nowIso() };
    pages = [defaultPage];
    sections = sections.map((s) => (s.pageId ? s : Object.assign({}, s, { pageId: defaultPage.id })));
  } else {
    pages = pages.map((p, i) => Object.assign({ type: "tasks", order: i + 1, sharedPageId: null, shareRole: null, linkedListIds: [] }, p));
    const fallbackPageId = pages[0].id;
    sections = sections.map((s) => (s.pageId ? s : Object.assign({}, s, { pageId: fallbackPageId })));
  }

  // Guard against anything (an older export, a hand-edited import) that
  // has these keys present but malformed, rather than just missing —
  // downstream code assumes linkedListIds is always a real array.
  pages = pages.map((p) => Object.assign({}, p, {
    type: p.type === "grocery" || p.type === "calendar" || p.type === "meals" ? p.type : "tasks",
    linkedListIds: Array.isArray(p.linkedListIds) ? p.linkedListIds : []
  }));

  const sectionPageMap = {};
  sections.forEach((s) => { sectionPageMap[s.id] = s.pageId; });
  const fallbackPageId = pages[0] ? pages[0].id : null;
  tasks = tasks.map((t) => Object.assign({}, t, { pageId: sectionPageMap[t.sectionId] || t.pageId || fallbackPageId }));

  // Older data (and exports from before the trash existed) simply has none.
  const trash = Array.isArray(raw.trash)
    ? raw.trash.filter((e) => e && typeof e === "object" && e.id && Array.isArray(e.tasks) && Array.isArray(e.sections))
    : [];

  return { pages, sections, tasks, trash };
}

// A daily task (isDaily: true) that's still marked done from a PREVIOUS
// calendar day gets flipped back to undone, in place — no new row, unlike
// a recurring task's spawn-on-complete. Comparing against completedAt's
// own date (not some separately-stored "last reset" timestamp) means this
// is naturally idempotent and needs no extra state: run it as often as
// you like, it's a no-op once every daily task is already caught up for
// today. Returns whether anything actually changed, so callers can skip
// persisting/notifying on the (overwhelmingly common) no-op case.
//
// The rule, the same no matter where it was checked (Today list, phone home
// screen, its own list, another device): every daily task checked on an
// earlier day unchecks at 12:01 AM local time. `doneDay` records which day a
// check-off counted for, fixed at the moment it was checked.
function checkedDayOf(t) {
  if (t.doneDay) return t.doneDay;
  return t.completedAt ? dailyDayOf(t.completedAt) : null;
}
//
// Repeating to-dos (Repeat: weekly, Mon & Wed, …) follow the same rule
// as daily tasks. They're ONE row: check it off and it stays checked for the
// rest of that day. At 12:01 AM it unchecks and its due date moves to the
// next scheduled day. (Before v12 every check-off created a second copy for
// the next date instead.) Calendar events are different: their repeats are
// drawn on the grid, so they're left alone here.
function isRepeatingTodo(t) {
  if (!t.recurrence || t.isDaily) return false;
  const page = findPage(t.pageId);
  return !page || (page.type !== "calendar" && page.type !== "meals");
}

// The next scheduled date strictly after both the current due date and the
// day it was checked off. Checked early (Sunday, for Monday) → Wednesday;
// checked late (Thursday, for Monday) → the following Monday.
function nextDueAfter(t, checkedDay) {
  let next = advanceDate(t.dueDate || checkedDay, t.recurrence);
  for (let i = 0; i < 4000 && next <= checkedDay; i++) {
    const step = advanceDate(next, t.recurrence);
    if (step <= next) break;
    next = step;
  }
  return next;
}

function resetDailyTasks(now) {
  const today = dailyDayOf(now || new Date());
  let changed = false;
  state.tasks.forEach((t) => {
    if (!t.done) return;
    const repeating = isRepeatingTodo(t);
    if (!t.isDaily && !repeating) return;
    const day = checkedDayOf(t);
    // No record of when (old data) or an earlier day: uncheck. A LATER day
    // (a device whose clock or time zone is ahead) is left alone.
    if (!day || day < today) {
      if (repeating) {
        const from = t.dueDate;
        const nextDue = nextDueAfter(t, day || today);
        t.dueDate = nextDue;
        // A "remind me" time rides along with the due date.
        if (t.remindAt && from) t.remindAt = shiftRemindAt(t.remindAt, from, nextDue);
        else if (t.remindAt && t.remindAt.slice(0, 10) < today) t.remindAt = null;
      }
      t.done = false;
      t.completedAt = null;
      t.doneDay = null;
      t.updatedAt = nowIso();
      changed = true;
    }
  });
  return changed;
}

// One-time tidy-up for data from before v12, when checking off a repeating
// to-do created a second copy for the next date. A checked-off repeating
// to-do with an unchecked copy of itself (same list, section, text and
// repeat pattern) is one of those old copies. It stays as a checked-off
// record but no longer repeats, so the new 12:01 AM rule doesn't bring it
// back as a duplicate. Nothing is deleted.
function retireOldRepeatCopies() {
  const recKey = (r) => (r ? JSON.stringify([r.unit, r.interval || 1, (r.days || []).slice().sort()]) : "");
  const activeKeys = new Set();
  state.tasks.forEach((t) => {
    if (!t.done && isRepeatingTodo(t)) activeKeys.add([t.pageId, t.sectionId, (t.text || "").trim().toLowerCase(), recKey(t.recurrence)].join("|"));
  });
  let changed = false;
  state.tasks.forEach((t) => {
    if (!t.done || !isRepeatingTodo(t)) return;
    const key = [t.pageId, t.sectionId, (t.text || "").trim().toLowerCase(), recKey(t.recurrence)].join("|");
    if (activeKeys.has(key)) {
      t.recurrence = null;
      t.remindAt = null;
      t.updatedAt = nowIso();
      changed = true;
    }
  });
  return changed;
}

const rawLoadedData = readJson(DATA_KEY, defaultData());
let state = normalizeState(rawLoadedData);
// If this was old (pre-pages) or otherwise not-current-shape data, write the
// migrated shape straight back so localStorage, export, and sync all reflect
// it immediately rather than only after the user's next edit. Also catch up
// any daily tasks left checked from a previous day (the app may have been
// closed when that day rolled over) in the same write.
const migratedOnLoad = JSON.stringify(rawLoadedData) !== JSON.stringify(state);
const oldCopiesRetired = retireOldRepeatCopies();
const dailyResetOnLoad = resetDailyTasks() || oldCopiesRetired;
const trashPurgedOnLoad = purgeOldTrash();
if (migratedOnLoad || dailyResetOnLoad || trashPurgedOnLoad) writeJson(DATA_KEY, state);

let settings = readJson(SETTINGS_KEY, { provider: "none", apiKey: "", model: "", font: "default", theme: {} });
if (!settings.theme || typeof settings.theme !== "object") settings.theme = {};

const listeners = new Set();
const undoStack = [];

function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

function persist() {
  writeJson(DATA_KEY, state);
  notify();
}

// Snapshot current state onto the undo stack before a local mutation. Not
// called for remote-originated changes (import / cloud sync pulls), so
// those aren't undoable — Ctrl+Z only reverts things *you* just did here.
function pushUndo() {
  try {
    undoStack.push(JSON.parse(JSON.stringify(state)));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  } catch (e) { /* non-fatal — undo just won't have this step */ }
}

function applyIncomingData(incoming) {
  if (!incoming || (!Array.isArray(incoming.sections) && !Array.isArray(incoming.pages)) || !Array.isArray(incoming.tasks)) {
    throw new Error("That doesn't look like Venture Tasks data.");
  }
  state = normalizeState(incoming);
  // Data coming from another device or a backup can still have a daily
  // task checked from an earlier day; catch it up right away instead of
  // waiting for the next once-a-minute check.
  retireOldRepeatCopies();
  resetDailyTasks();
  persist();
}

// A fresh task/item with every field at its default.
function newTask(sectionId, text) {
  const section = findSection(sectionId);
  return {
    id: uid(),
    text: text,
    done: false,
    sectionId: sectionId,
    pageId: section ? section.pageId : null,
    order: Date.now(),
    // A new task/item starts color-matched to its own section (every
    // section always has a real color, assigned from SECTION_PALETTE at
    // creation); it can still be changed individually afterward.
    color: section ? section.color : null,
    dueDate: null,
    eventTime: null,
    recurrence: null,
    isSomeday: false,
    isDaily: false,
    client: null,
    value: null,
    note: null,
    remindAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null
  };
}

function findPage(id) { return state.pages.find((p) => p.id === id); }
function findSection(id) { return state.sections.find((s) => s.id === id); }
function findTask(id) { return state.tasks.find((t) => t.id === id); }

export const store = {
  // --- subscription ---
  subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },

  getState() {
    return state;
  },

  // --- undo ---
  canUndo() {
    return undoStack.length > 0;
  },

  undo() {
    const prev = undoStack.pop();
    if (!prev) return false;
    state = prev;
    persist();
    return true;
  },

  // Called once at load (above) and again periodically while the app
  // stays open (see app.js) so a daily task left checked from a previous
  // day resets even if the browser tab was never closed across midnight.
  // Deliberately NOT pushed to the undo stack — this is automatic
  // day-rollover housekeeping, not something the user just did, so
  // Ctrl+Z shouldn't be able to "undo" a day actually passing.
  checkDailyReset(now) {
    const reset = resetDailyTasks(now);
    const purged = purgeOldTrash();
    if (reset || purged) persist();
  },

  // --- pages ---
  // seedDefaults=false skips the default grocery categories — used when
  // joining a shared list, where the real sections are about to be
  // pulled down from the shared tables and default ones would just be
  // duplicate clutter.
  addPage(name, type, seedDefaults) {
    pushUndo();
    const pageType = type === "grocery" || type === "calendar" || type === "meals" ? type : "tasks";
    const page = {
      id: uid(),
      name: (name || "Untitled").trim() || "Untitled",
      type: pageType,
      order: state.pages.reduce((max, p) => Math.max(max, p.order || 0), 0) + 1,
      sharedPageId: null,
      shareRole: null,
      linkedListIds: [],
      createdAt: nowIso()
    };
    state.pages.push(page);
    if (pageType === "grocery" && seedDefaults !== false) {
      // One undo step for the whole page, default categories included —
      // not one step per category.
      DEFAULT_GROCERY_CATEGORIES.forEach((catName, i) => {
        state.sections.push({
          id: uid(),
          pageId: page.id,
          name: catName,
          order: i + 1,
          color: SECTION_PALETTE[i % SECTION_PALETTE.length],
          createdAt: nowIso()
        });
      });
    } else if (pageType === "meals" && seedDefaults !== false) {
      // Like a calendar, a meal plan keeps its meals in one hidden section.
      state.sections.push({ id: uid(), pageId: page.id, name: "Meals", order: 1, color: SECTION_PALETTE[2 % SECTION_PALETTE.length], createdAt: nowIso() });
    } else if (pageType === "calendar" && seedDefaults !== false) {
      // A calendar page's events all live in one implicit section — the
      // UI never shows "sections" for a calendar page, this just reuses
      // the existing section/task plumbing instead of building a parallel
      // one for events.
      state.sections.push({
        id: uid(),
        pageId: page.id,
        name: "Events",
        order: 1,
        color: SECTION_PALETTE[0],
        createdAt: nowIso()
      });
    }
    persist();
    return page;
  },

  // --- calendar pages: linking to-do/grocery lists so their due dates
  // show up on the grid too (see sync.js for how this propagates to a
  // SHARED calendar's other members) ---
  linkListToCalendar(calendarPageId, listPageId) {
    const p = findPage(calendarPageId);
    if (!p || p.type !== "calendar") return;
    if (!Array.isArray(p.linkedListIds)) p.linkedListIds = [];
    if (p.linkedListIds.includes(listPageId)) return;
    pushUndo();
    p.linkedListIds = p.linkedListIds.concat([listPageId]);
    persist();
  },

  unlinkListFromCalendar(calendarPageId, listPageId) {
    const p = findPage(calendarPageId);
    if (!p || p.type !== "calendar") return;
    pushUndo();
    p.linkedListIds = (p.linkedListIds || []).filter((id) => id !== listPageId);
    persist();
  },

  // Remote-originated: overwrites a calendar's linked-list set with what
  // was just resolved from the server (a shared calendar's
  // linked_shared_page_ids, translated to local page ids) or with a
  // locally-computed set. Not undoable, like the other remote-apply
  // methods above.
  setLinkedLists(calendarPageId, localPageIds) {
    const p = findPage(calendarPageId);
    if (!p) return;
    p.linkedListIds = Array.isArray(localPageIds) ? localPageIds.slice() : [];
    persist();
  },

  renamePage(id, name) {
    const p = findPage(id);
    if (!p) return;
    pushUndo();
    p.name = name;
    persist();
  },

  // A page's own color (home-screen card + sidebar), or null for the
  // theme's accent. Personal: on a shared list it isn't pushed to the
  // other members — everyone colors their own home screen.
  setPageColor(id, color) {
    const p = findPage(id);
    if (!p) return;
    pushUndo();
    p.color = color || null;
    persist();
  },

  deletePage(id) {
    if (state.pages.length <= 1) return false; // always keep at least one page
    pushUndo();
    const page = findPage(id);
    if (page) {
      const pageTasks = state.tasks.filter((t) => t.pageId === id);
      addToTrash({
        kind: "page",
        label: page.name || "Untitled",
        pageName: page.name || "Untitled",
        itemCount: pageTasks.length,
        page: cloneJson(page),
        sections: cloneJson(state.sections.filter((s) => s.pageId === id)),
        tasks: cloneJson(pageTasks)
      });
    }
    state.pages = state.pages.filter((p) => p.id !== id);
    state.sections = state.sections.filter((s) => s.pageId !== id);
    state.tasks = state.tasks.filter((t) => t.pageId !== id);
    persist();
    return true;
  },

  reorderPages(orderedIds) {
    pushUndo();
    orderedIds.forEach((id, i) => {
      const p = findPage(id);
      if (p) p.order = i + 1;
    });
    persist();
  },

  // --- sections (a page's "categories" when page.type === "grocery") ---
  addSection(pageId, name) {
    pushUndo();
    const siblingCount = state.sections.filter((s) => s.pageId === pageId).length;
    const section = {
      id: uid(),
      pageId: pageId,
      name: name,
      order: Date.now(),
      color: SECTION_PALETTE[siblingCount % SECTION_PALETTE.length],
      createdAt: nowIso()
    };
    state.sections.push(section);
    persist();
    return section;
  },

  renameSection(id, name) {
    const s = findSection(id);
    if (!s) return;
    pushUndo();
    s.name = name;
    persist();
  },

  setSectionColor(id, color) {
    const s = findSection(id);
    if (!s) return;
    pushUndo();
    s.color = color;
    persist();
  },

  deleteSection(id) {
    pushUndo();
    const section = findSection(id);
    if (section) {
      const page = findPage(section.pageId);
      const sectionTasks = state.tasks.filter((t) => t.sectionId === id);
      addToTrash({
        kind: "section",
        label: section.name || "Untitled",
        pageName: page ? page.name || "Untitled" : "",
        itemCount: sectionTasks.length,
        page: cloneJson(page || null),
        sections: [cloneJson(section)],
        tasks: cloneJson(sectionTasks)
      });
    }
    state.sections = state.sections.filter((x) => x.id !== id);
    state.tasks = state.tasks.filter((t) => t.sectionId !== id);
    persist();
  },

  reorderSections(orderedIds) {
    pushUndo();
    orderedIds.forEach((id, i) => {
      const s = findSection(id);
      if (s) s.order = i + 1;
    });
    persist();
  },

  // --- tasks (a section's "items" when its page is a grocery list) ---
  addTask(sectionId, text) {
    pushUndo();
    const task = newTask(sectionId, text);
    state.tasks.push(task);
    persist();
    return task;
  },

  // Several items into (possibly different) sections as ONE undo step, e.g.
  // a meal's ingredients going onto the grocery list. items: [{sectionId, text}]
  addTasks(items) {
    if (!items || !items.length) return [];
    pushUndo();
    const made = items.map((it, i) => {
      const t = newTask(it.sectionId, it.text);
      t.order = Date.now() + i;
      state.tasks.push(t);
      return t;
    });
    persist();
    return made;
  },

  // --- meal plans (page.type === "meals") ---
  // A meal is a task on the plan's one section: text = meal name,
  // dueDate = the day, plus `ingredients` (array of strings) and `note`.
  // meals: [{ text, dueDate, ingredients, note }]. One undo step.
  addMeals(pageId, meals) {
    if (!meals || !meals.length) return [];
    pushUndo();
    let section = state.sections.filter((s) => s.pageId === pageId).sort((a, b) => a.order - b.order)[0];
    if (!section) {
      section = { id: uid(), pageId, name: "Meals", order: 1, color: SECTION_PALETTE[2 % SECTION_PALETTE.length], createdAt: nowIso() };
      state.sections.push(section);
    }
    const made = meals.map((m, i) => {
      const t = newTask(section.id, (m.text || "").trim() || "Dinner");
      t.order = Date.now() + i;
      t.dueDate = m.dueDate || null;
      t.ingredients = Array.isArray(m.ingredients) ? m.ingredients.slice() : [];
      t.note = m.note || null;
      state.tasks.push(t);
      return t;
    });
    persist();
    return made;
  },

  // Which grocery list a meal plan sends its ingredients to. A preference,
  // not an edit, so it's not on the undo stack.
  setMealGroceryTarget(pageId, groceryPageId) {
    const p = findPage(pageId);
    if (!p) return;
    p.groceryPageId = groceryPageId || null;
    persist();
  },

  updateTask(id, patch) {
    const t = findTask(id);
    if (!t) return;
    pushUndo();
    Object.assign(t, patch, { updatedAt: nowIso() });
    persist();
  },

  deleteTask(id) {
    pushUndo();
    const task = findTask(id);
    if (task) {
      const page = findPage(task.pageId);
      const section = findSection(task.sectionId);
      addToTrash({
        kind: page && page.type === "calendar" ? "event" : page && page.type === "grocery" ? "item" : "task",
        label: task.text || "Untitled",
        pageName: page ? page.name || "Untitled" : "",
        itemCount: 1,
        page: cloneJson(page || null),
        sections: section ? [cloneJson(section)] : [],
        tasks: [cloneJson(task)]
      });
    }
    state.tasks = state.tasks.filter((x) => x.id !== id);
    persist();
  },

  // --- sample setup (welcome.js) ---
  // Adds the sample pages alongside whatever's there — it never replaces
  // anything — except that a brand-new user's single untouched default
  // page is dropped so the sample isn't sitting next to an empty page.
  // One undo step for the whole thing.
  loadSample(sample) {
    if (!sample || !Array.isArray(sample.pages)) return null;
    pushUndo();
    const untouched = state.pages.length === 1 && state.sections.length === 0 && state.tasks.length === 0;
    if (untouched) state.pages = [];
    const startOrder = state.pages.reduce((max, p) => Math.max(max, p.order || 0), 0);
    sample.pages.forEach((p, i) => state.pages.push(Object.assign({}, p, { order: startOrder + i + 1 })));
    sample.sections.forEach((s) => state.sections.push(Object.assign({}, s)));
    sample.tasks.forEach((t) => state.tasks.push(Object.assign({}, t)));
    persist();
    return sample.pages[0] ? sample.pages[0].id : null;
  },

  // --- recently deleted ---
  getTrash() {
    return state.trash;
  },

  // Puts everything in a trash entry back. Anything that already exists
  // again (e.g. its section was restored separately first) is left alone
  // rather than duplicated; a page or section that no longer exists is
  // recreated from the entry's snapshot. A restored page always comes
  // back as a personal (unshared) page — its old shared list may be long
  // gone, and re-sharing is one click.
  restoreFromTrash(entryId) {
    const entry = state.trash.find((e) => e.id === entryId);
    if (!entry) return false;
    pushUndo();
    const pageIds = new Set(state.pages.map((p) => p.id));
    const sectionIds = new Set(state.sections.map((s) => s.id));
    const taskIds = new Set(state.tasks.map((t) => t.id));
    if (entry.page && !pageIds.has(entry.page.id)) {
      state.pages.push(Object.assign({}, entry.page, {
        sharedPageId: null,
        shareRole: null,
        linkedListIds: Array.isArray(entry.page.linkedListIds) ? entry.page.linkedListIds : [],
        order: state.pages.reduce((max, p) => Math.max(max, p.order || 0), 0) + 1
      }));
    }
    entry.sections.forEach((s) => { if (!sectionIds.has(s.id)) state.sections.push(Object.assign({}, s)); });
    entry.tasks.forEach((t) => { if (!taskIds.has(t.id)) state.tasks.push(Object.assign({}, t, { updatedAt: nowIso() })); });
    state.trash = state.trash.filter((e) => e.id !== entryId);
    persist();
    return entry.page ? entry.page.id : true;
  },

  deleteFromTrash(entryId) {
    pushUndo();
    state.trash = state.trash.filter((e) => e.id !== entryId);
    persist();
  },

  emptyTrash() {
    if (!state.trash.length) return;
    pushUndo();
    state.trash = [];
    persist();
  },

  // Toggles done/not-done as one undoable step, including spawning the next
  // occurrence of a recurring task — so one Ctrl+Z reverts the whole thing.
  toggleTaskDone(id) {
    const t = findTask(id);
    if (!t) return;
    pushUndo();
    const next = !t.done;
    t.done = next;
    t.completedAt = next ? nowIso() : null;
    t.doneDay = next ? dailyDayOf(new Date()) : null;
    t.updatedAt = nowIso();
    // Daily tasks AND repeating to-dos stay one row: checked for the rest
    // of today, then resetDailyTasks unchecks them at 12:01 AM (moving a
    // repeating one's due date to its next scheduled day). No copies.
    persist();
  },

  moveTask(id, toSectionId) {
    const t = findTask(id);
    if (!t) return;
    pushUndo();
    const section = findSection(toSectionId);
    t.sectionId = toSectionId;
    t.pageId = section ? section.pageId : t.pageId;
    t.order = Date.now();
    t.updatedAt = nowIso();
    persist();
  },

  // Moves a task into `sectionId`, positioned immediately before
  // `beforeTaskId` (or at the end, if beforeTaskId is null/omitted). Used
  // for drag-and-drop — covers both "move to another section" and
  // "reorder within the same section" with one method.
  reorderTaskInSection(taskId, sectionId, beforeTaskId) {
    const task = findTask(taskId);
    if (!task) return;
    pushUndo();
    const section = findSection(sectionId);
    const siblings = state.tasks
      .filter((t) => t.sectionId === sectionId && t.id !== taskId)
      .sort((a, b) => a.order - b.order);

    let newOrder;
    const idx = beforeTaskId ? siblings.findIndex((t) => t.id === beforeTaskId) : -1;
    if (idx === -1) {
      const last = siblings[siblings.length - 1];
      newOrder = last ? last.order + 1 : Date.now();
    } else {
      const next = siblings[idx];
      const prev = siblings[idx - 1];
      newOrder = prev ? (prev.order + next.order) / 2 : next.order - 1;
    }

    task.sectionId = sectionId;
    task.pageId = section ? section.pageId : task.pageId;
    task.order = newOrder;
    task.updatedAt = nowIso();
    persist();
  },

  addTaskFull(task) {
    pushUndo();
    const full = Object.assign({ id: uid() }, task);
    state.tasks.push(full);
    persist();
    return full;
  },

  // --- shared pages (see sync.js + shared-lists-schema.sql) ---
  // A page with sharedPageId set is mirrored into the shared_* Supabase
  // tables, where every member — not just this account — can read and
  // write its sections/tasks. Everything below is remote-originated
  // (like replaceState), so none of it is undoable or pushes to the
  // local undo stack; Ctrl+Z is for things *you* just typed, not for
  // syncing itself.

  findPage(id) {
    return findPage(id);
  },

  // Marks a local page as backed by a shared_pages row — called once,
  // right after creating one (owner) or redeeming an invite code (joiner).
  markPageShared(pageId, sharedPageId, role) {
    const p = findPage(pageId);
    if (!p) return;
    p.sharedPageId = sharedPageId;
    p.shareRole = role;
    persist();
  },

  // Reverts a page to personal-only: the owner stopped sharing it, or
  // this account left it. Whatever sections/tasks are already in local
  // state stay right where they are — they just stop being mirrored.
  unmarkPageShared(pageId) {
    const p = findPage(pageId);
    if (!p) return;
    p.sharedPageId = null;
    p.shareRole = null;
    persist();
  },

  // Wholesale-replaces every section/task belonging to `pageId` with
  // what's currently in the shared tables — used right after joining a
  // shared list for the first time, when there's nothing local to merge.
  replaceSharedPageContents(pageId, sections, tasks) {
    state.sections = state.sections.filter((s) => s.pageId !== pageId).concat(sections);
    state.tasks = state.tasks.filter((t) => t.pageId !== pageId).concat(tasks);
    persist();
  },

  // Applies one incoming realtime change for a shared section/task.
  upsertRemoteSection(section) {
    const i = state.sections.findIndex((s) => s.id === section.id);
    if (i === -1) state.sections.push(section);
    else state.sections[i] = section;
    persist();
  },

  removeRemoteSection(id) {
    state.sections = state.sections.filter((s) => s.id !== id);
    state.tasks = state.tasks.filter((t) => t.sectionId !== id);
    persist();
  },

  upsertRemoteTask(task) {
    const i = state.tasks.findIndex((t) => t.id === task.id);
    if (i === -1) state.tasks.push(task);
    // A change from another member replaces the shared fields, but never
    // your personal ones (a "remind me" time is yours alone, not the list's).
    else {
      const local = state.tasks[i];
      const merged = Object.assign({}, local);
      // Fields the server didn't send (undefined) keep this device's value
      // instead of being wiped, e.g. "Daily task" on a project whose
      // shared_tasks table predates the is_daily column.
      Object.keys(task).forEach((k) => { if (task[k] !== undefined) merged[k] = task[k]; });
      // Shared-list rows don't carry doneDay; work it out from the
      // completion time so the 12:01 AM rule still applies.
      if (task.doneDay === undefined) merged.doneDay = merged.done && merged.completedAt ? dailyDayOf(merged.completedAt) : null;
      merged.remindAt = local.remindAt || null;
      merged.remindBefore = local.remindBefore == null ? null : local.remindBefore;
      state.tasks[i] = merged;
    }
    // A daily task arriving still checked from an earlier day resets now.
    retireOldRepeatCopies();
    resetDailyTasks();
    persist();
  },

  removeRemoteTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    persist();
  },

  // --- settings (AI provider, appearance) ---
  getSettings() {
    return settings;
  },

  setSettings(patch) {
    settings = Object.assign({}, settings, patch);
    writeJson(SETTINGS_KEY, settings);
    return settings;
  },

  // --- export / import ---
  exportJson() {
    return JSON.stringify({ exportedAt: nowIso(), version: 2, data: state }, null, 2);
  },

  importJson(jsonText) {
    const parsed = JSON.parse(jsonText);
    const incoming = parsed && parsed.data ? parsed.data : parsed;
    try {
      applyIncomingData(incoming);
    } catch (e) {
      throw new Error("That file doesn't look like a Venture Tasks export.");
    }
  },

  // --- cloud sync (see sync.js) ---
  // Replaces local state wholesale with a remote snapshot (e.g. pulled down
  // on sign-in, or received over the realtime subscription from another
  // device). Distinct from importJson only in that it takes an already-
  // parsed object rather than a JSON string from a file. Deliberately NOT
  // undoable (see pushUndo's comment above).
  replaceState(data) {
    applyIncomingData(data);
  },

  // Wipes every page/section/task and starts over with one fresh default
  // page — used after deleting the account (see sync.js's
  // deleteMyAccount): the account and everything synced to it are gone
  // server-side, so the local copy shouldn't keep sitting there looking
  // like it's still attached to something that no longer exists. Not
  // undoable, same as the other wholesale-replace methods above.
  resetAllLocalData() {
    state = normalizeState(defaultData());
    persist();
  }
};

export { SECTION_PALETTE, DEFAULT_PAGE_NAME };
