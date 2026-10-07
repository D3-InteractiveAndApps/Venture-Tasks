// store.js
// All persistence lives in this one module: everything is in the browser's
// localStorage, synchronous, per-device. No network, no backend, no accounts.
// A simple pub/sub lets app.js re-render whenever the data changes.

const DATA_KEY = "ventureTasks:data:v1";
const SETTINGS_KEY = "ventureTasks:settings:v1";

const SECTION_PALETTE = ["#3d8bff", "#a855f7", "#e0b23d", "#e05f8a", "#2bb6a3", "#8a6d3b"];

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
  return { sections: [], tasks: [] };
}

let state = readJson(DATA_KEY, defaultData());
if (!Array.isArray(state.sections)) state.sections = [];
if (!Array.isArray(state.tasks)) state.tasks = [];

let settings = readJson(SETTINGS_KEY, { provider: "none", apiKey: "", model: "" });

const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

function persist() {
  writeJson(DATA_KEY, state);
  notify();
}

function applyIncomingData(incoming) {
  if (!incoming || !Array.isArray(incoming.sections) || !Array.isArray(incoming.tasks)) {
    throw new Error("That doesn't look like Venture Tasks data.");
  }
  state = { sections: incoming.sections, tasks: incoming.tasks };
  persist();
}

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

  // --- sections ---
  addSection(name) {
    const section = {
      id: uid(),
      name: name,
      order: Date.now(),
      color: SECTION_PALETTE[state.sections.length % SECTION_PALETTE.length],
      createdAt: nowIso()
    };
    state.sections.push(section);
    persist();
    return section;
  },

  renameSection(id, name) {
    const s = state.sections.find((x) => x.id === id);
    if (!s) return;
    s.name = name;
    persist();
  },

  setSectionColor(id, color) {
    const s = state.sections.find((x) => x.id === id);
    if (!s) return;
    s.color = color;
    persist();
  },

  deleteSection(id) {
    state.sections = state.sections.filter((x) => x.id !== id);
    state.tasks = state.tasks.filter((t) => t.sectionId !== id);
    persist();
  },

  reorderSections(orderedIds) {
    orderedIds.forEach((id, i) => {
      const s = state.sections.find((x) => x.id === id);
      if (s) s.order = i + 1;
    });
    persist();
  },

  // --- tasks ---
  addTask(sectionId, text) {
    const task = {
      id: uid(),
      text: text,
      done: false,
      sectionId: sectionId,
      order: Date.now(),
      color: null,
      dueDate: null,
      recurrence: null,
      isSomeday: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null
    };
    state.tasks.push(task);
    persist();
    return task;
  },

  updateTask(id, patch) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch, { updatedAt: nowIso() });
    persist();
  },

  deleteTask(id) {
    state.tasks = state.tasks.filter((x) => x.id !== id);
    persist();
  },

  moveTask(id, toSectionId) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.sectionId = toSectionId;
    t.order = Date.now();
    t.updatedAt = nowIso();
    persist();
  },

  addTaskFull(task) {
    const full = Object.assign({ id: uid() }, task);
    state.tasks.push(full);
    persist();
    return full;
  },

  // --- settings (AI provider) ---
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
    return JSON.stringify({ exportedAt: nowIso(), version: 1, data: state }, null, 2);
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

  // --- cloud sync (see js/sync.js) ---
  // Replaces local state wholesale with a remote snapshot (e.g. pulled down
  // on sign-in, or received over the realtime subscription from another
  // device). Distinct from importJson only in that it takes an already-
  // parsed object rather than a JSON string from a file.
  replaceState(data) {
    applyIncomingData(data);
  }
};

export { SECTION_PALETTE };
