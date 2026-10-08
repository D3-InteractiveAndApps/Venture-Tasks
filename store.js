// store.js
// All persistence lives in this one module: everything is in the browser's
// localStorage, synchronous, per-device (plus optional cloud sync — see
// sync.js). A simple pub/sub lets app.js re-render whenever data changes.
//
// Data shape:
//   state.pages    — top-level tabs: { id, name, type: "tasks"|"grocery", order, createdAt }
//   state.sections — belong to a page: { id, pageId, name, order, color, createdAt }
//   state.tasks    — belong to a section: { id, pageId, sectionId, text, done, order,
//                     color, dueDate, recurrence, isSomeday, client, value,
//                     createdAt, updatedAt, completedAt }
// A task's pageId always mirrors its section's pageId; it's kept redundantly
// for simpler filtering.

import { advanceDate } from "./dates.js";

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
  return { pages: [], sections: [], tasks: [] };
}

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
    const defaultPage = { id: uid(), name: DEFAULT_PAGE_NAME, type: "tasks", order: 1, createdAt: nowIso() };
    pages = [defaultPage];
    sections = sections.map((s) => (s.pageId ? s : Object.assign({}, s, { pageId: defaultPage.id })));
  } else {
    pages = pages.map((p, i) => Object.assign({ type: "tasks", order: i + 1 }, p));
    const fallbackPageId = pages[0].id;
    sections = sections.map((s) => (s.pageId ? s : Object.assign({}, s, { pageId: fallbackPageId })));
  }

  const sectionPageMap = {};
  sections.forEach((s) => { sectionPageMap[s.id] = s.pageId; });
  const fallbackPageId = pages[0] ? pages[0].id : null;
  tasks = tasks.map((t) => Object.assign({}, t, { pageId: sectionPageMap[t.sectionId] || t.pageId || fallbackPageId }));

  return { pages, sections, tasks };
}

const rawLoadedData = readJson(DATA_KEY, defaultData());
let state = normalizeState(rawLoadedData);
// If this was old (pre-pages) or otherwise not-current-shape data, write the
// migrated shape straight back so localStorage, export, and sync all reflect
// it immediately rather than only after the user's next edit.
if (JSON.stringify(rawLoadedData) !== JSON.stringify(state)) writeJson(DATA_KEY, state);

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
  persist();
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

  // --- pages ---
  addPage(name, type) {
    pushUndo();
    const pageType = type === "grocery" ? "grocery" : "tasks";
    const page = {
      id: uid(),
      name: (name || "Untitled").trim() || "Untitled",
      type: pageType,
      order: state.pages.reduce((max, p) => Math.max(max, p.order || 0), 0) + 1,
      createdAt: nowIso()
    };
    state.pages.push(page);
    if (pageType === "grocery") {
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
    }
    persist();
    return page;
  },

  renamePage(id, name) {
    const p = findPage(id);
    if (!p) return;
    pushUndo();
    p.name = name;
    persist();
  },

  deletePage(id) {
    if (state.pages.length <= 1) return false; // always keep at least one page
    pushUndo();
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
    const section = findSection(sectionId);
    const task = {
      id: uid(),
      text: text,
      done: false,
      sectionId: sectionId,
      pageId: section ? section.pageId : null,
      order: Date.now(),
      color: null,
      dueDate: null,
      recurrence: null,
      isSomeday: false,
      client: null,
      value: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null
    };
    state.tasks.push(task);
    persist();
    return task;
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
    state.tasks = state.tasks.filter((x) => x.id !== id);
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
    t.updatedAt = nowIso();
    if (next && t.recurrence) {
      state.tasks.push({
        id: uid(),
        text: t.text,
        done: false,
        sectionId: t.sectionId,
        pageId: t.pageId,
        order: Date.now(),
        color: t.color || null,
        dueDate: advanceDate(t.dueDate, t.recurrence),
        recurrence: t.recurrence,
        isSomeday: !!t.isSomeday,
        client: t.client || null,
        value: t.value || null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        completedAt: null
      });
    }
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
  }
};

export { SECTION_PALETTE, DEFAULT_PAGE_NAME };
