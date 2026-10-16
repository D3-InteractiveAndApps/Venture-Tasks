// welcome.js — first-run onboarding: a dismissible welcome card (not a
// blocking modal — you can ignore it and start typing) with a 30-second
// tour of the features people otherwise never discover, plus an optional
// sample setup to poke at. The sample is ordinary data: delete any of it.
//
// Shown automatically only to a genuinely brand-new user (one empty page,
// nothing in it). Existing users never see it unless they ask for it again
// from Settings → Help & privacy.

import { fmtDate } from "./dates.js";

const DISMISSED_KEY = "ventureTasks:welcomeDismissed";

export function isWelcomeDismissed() {
  try { return window.localStorage.getItem(DISMISSED_KEY) === "1"; } catch (e) { return false; }
}
export function setWelcomeDismissed(val) {
  try {
    if (val) window.localStorage.setItem(DISMISSED_KEY, "1");
    else window.localStorage.removeItem(DISMISSED_KEY);
  } catch (e) { /* per-browser convenience only */ }
}

export function isFreshState(state) {
  return (state.pages || []).length <= 1 && (state.sections || []).length === 0 && (state.tasks || []).length === 0;
}

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// A small, believable setup across all three page types, dated relative to
// today so the Today view and calendar have something to show immediately.
export function buildSampleData(now) {
  const base = now ? new Date(now) : new Date();
  const day = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return fmtDate(d); };
  const iso = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d.toISOString(); };
  const created = new Date(base).toISOString();
  const pages = [], sections = [], tasks = [];
  let order = 1;

  function page(name, type, extra) {
    const p = Object.assign({ id: uid(), name, type, order: 0, sharedPageId: null, shareRole: null, linkedListIds: [], createdAt: created }, extra || {});
    pages.push(p);
    return p;
  }
  function section(p, name, color) {
    const s = { id: uid(), pageId: p.id, name, order: sections.filter((x) => x.pageId === p.id).length + 1, color, createdAt: created };
    sections.push(s);
    return s;
  }
  function task(s, text, extra) {
    const t = Object.assign({
      id: uid(), pageId: s.pageId, sectionId: s.id, text, done: false, order: order++, color: s.color,
      dueDate: null, eventTime: null, recurrence: null, isSomeday: false, isDaily: false, client: null, value: null,
      createdAt: created, updatedAt: created, completedAt: null
    }, extra || {});
    tasks.push(t);
    return t;
  }

  const work = page("Client Work", "tasks");
  const design = section(work, "Design projects", "#e8622c");
  task(design, "Send revised logo files", { client: "Harbor Coffee", value: 450, dueDate: day(-1) });
  task(design, "Record Act 2 voiceover", { client: "Riven Animation", value: 1200, dueDate: day(0) });
  task(design, "Draft proposal", { client: "Maple Bakery", value: 800, dueDate: day(5) });
  const admin = section(work, "Admin", "#3d8bff");
  task(admin, "Invoice Harbor Coffee for menu boards", { client: "Harbor Coffee", value: 300, done: true, completedAt: iso(-2) });
  task(admin, "Pay quarterly estimated taxes", { dueDate: day(12), recurrence: { unit: "months", interval: 3 } });
  task(admin, "Redesign my portfolio site", { isSomeday: true });

  const home = page("Home", "tasks");
  const habits = section(home, "Daily habits", "#2bb6a3");
  task(habits, "Walk the dog", { isDaily: true });
  task(habits, "10 minutes of stretching", { isDaily: true });
  const house = section(home, "Around the house", "#a855f7");
  task(house, "Replace the furnace filter", { dueDate: day(3), recurrence: { unit: "months", interval: 3 } });
  task(house, "Book the kids' haircuts", { dueDate: day(6) });

  const groceries = page("Groceries", "grocery");
  const produce = section(groceries, "Produce", "#2bb6a3");
  task(produce, "Bananas");
  task(produce, "Spinach");
  const dairy = section(groceries, "Dairy & Eggs", "#e0b23d");
  task(dairy, "2% Milk");
  task(dairy, "Eggs", { done: true, completedAt: iso(0) });
  const bakery = section(groceries, "Bakery", "#e05f8a");
  task(bakery, "Sourdough loaf");

  const cal = page("Family Calendar", "calendar", { linkedListIds: [home.id] });
  const events = section(cal, "Events", "#3d8bff");
  task(events, "Soccer practice", { dueDate: day(1), eventTime: "17:00", recurrence: { unit: "weeks", interval: 1 } });
  task(events, "Dentist – Mia", { dueDate: day(2), eventTime: "14:30" });
  task(events, "Date night", { dueDate: day(4), eventTime: "19:00" });
  task(events, "Trash day", { dueDate: day(0), eventTime: "07:00", recurrence: { unit: "weeks", interval: 1 } });

  return { pages, sections, tasks };
}

// Builds the welcome card. `opts.compact` is the phone layout; `opts.hasData`
// switches the sample button to "add" wording (it never replaces anything).
export function buildWelcomeCard(opts) {
  const o = opts || {};
  const card = document.createElement("section");
  card.className = "welcome-card" + (o.compact ? " is-compact" : "");
  card.setAttribute("aria-labelledby", "welcome-title-" + (o.compact ? "m" : "d"));

  const head = document.createElement("div");
  head.className = "welcome-head";
  const h = document.createElement("h2");
  h.id = "welcome-title-" + (o.compact ? "m" : "d");
  h.textContent = "Welcome to Venture Tasks";
  head.appendChild(h);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "del-btn welcome-close";
  close.setAttribute("aria-label", "Dismiss the welcome tour");
  close.textContent = "×";
  close.addEventListener("click", () => o.onDismiss && o.onDismiss());
  head.appendChild(close);
  card.appendChild(head);

  const lead = document.createElement("p");
  lead.className = "welcome-lead";
  lead.textContent = "One place for every venture you're running. The 30-second tour:";
  card.appendChild(lead);

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const tips = [
    ["\u{1F4C4}", "A page per venture", o.compact ? "Keep client work, side projects, and home on separate lists — “+ Add a list” below." : "Keep client work, side projects, and home on separate pages — add one with + in the sidebar."],
    ["\u{1F4C5}", "Today, across everything", "Overdue, due today, daily habits, and today's events — from every page at once."],
    ["\u{1F46A}", "A shared family calendar", (o.compact ? "Press and hold" : "Double-click") + " a day to add an event. Share it, and link any list to it."],
    ["\u{1F50D}", "Search and client work", (o.compact ? "The 🔍 button" : (isMac ? "⌘K" : "Ctrl+K")) + " searches everything. Tag tasks with a client and value, then export a report in Settings."],
  ];
  const grid = document.createElement("div");
  grid.className = "welcome-tips";
  tips.forEach(([icon, title, text]) => {
    const tip = document.createElement("div");
    tip.className = "welcome-tip";
    const i = document.createElement("span");
    i.className = "welcome-tip-icon";
    i.setAttribute("aria-hidden", "true");
    i.textContent = icon;
    tip.appendChild(i);
    const body = document.createElement("div");
    const t = document.createElement("strong");
    t.textContent = title;
    body.appendChild(t);
    const p = document.createElement("p");
    p.textContent = text;
    body.appendChild(p);
    tip.appendChild(body);
    grid.appendChild(tip);
  });
  card.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "welcome-actions";
  const sample = document.createElement("button");
  sample.type = "button";
  sample.className = "primary-btn welcome-sample-btn";
  sample.textContent = o.hasData ? "Add sample pages to explore" : "Load a sample setup";
  sample.addEventListener("click", () => o.onSample && o.onSample());
  actions.appendChild(sample);
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "secondary-btn welcome-skip-btn";
  skip.textContent = o.hasData ? "Close" : "Start from scratch";
  skip.addEventListener("click", () => o.onDismiss && o.onDismiss());
  actions.appendChild(skip);
  card.appendChild(actions);

  const note = document.createElement("p");
  note.className = "welcome-note";
  note.textContent = "The sample is ordinary data — edit or delete any of it." + (o.compact ? "" : " Ctrl+Z undoes loading it.");
  card.appendChild(note);
  return card;
}
