// ui.js — renders the active page's tabs, sections and tasks from the
// store, and wires every interaction (tabs, drag/drop reordering, collapse,
// rename, color, due dates, recurrence, someday, the AI co-pilot, the
// weekly review, voice commands, and the completion celebration).

import {
  STALE_DAYS, daysUntil, daysSince, activityText,
  dueBadgeInfo, recurrenceValue, recurrenceFromValue, recurrenceLabel, advanceDate, fmtDate, todayStr
} from "./dates.js";
import { listenOnce, parseCommand, findBestMatch } from "./voice.js";
import { getHolidaysForYears } from "./holidays.js";
import { guessCategory } from "./categorize.js";
import * as sync from "./sync.js";

const LS_COLLAPSED_PREFIX = "ventureTasks:collapsed:";
const LS_HIDE_DONE_PREFIX = "ventureTasks:hideDone:";
const LS_ACTIVE_PAGE = "ventureTasks:activePage";
const TASK_COLOR_DEFAULT = "#9a9da3";

const CELEBRATE_PHRASES = ["Nice work!", "Boom — done.", "One down!", "Nailed it.", "Great job!", "Crushed it."];

const PAGE_LABELS = {
  tasks: {
    addSectionPlaceholder: "Add a section… (e.g. a new business or project)",
    addSectionBtn: "Add section",
    addTaskPlaceholder: (n) => "Add a task to " + n + "…",
    emptyTasks: "No tasks yet in this section.",
    emptyAll: "No sections yet. Add your first business or project below.",
    noun: "section", nounCap: "Section"
  },
  grocery: {
    addSectionPlaceholder: "Add a category… (e.g. Produce, Dairy)",
    addSectionBtn: "Add category",
    addTaskPlaceholder: (n) => "Add an item to " + n + "…",
    emptyTasks: "No items yet in this category.",
    emptyAll: "No categories yet. Add your first one below.",
    noun: "category", nounCap: "Category"
  },
  // Calendar pages bypass almost all of this (see render()'s isCalendar
  // branch) — kept mostly so nothing downstream chokes on a missing entry.
  calendar: {
    addSectionPlaceholder: "", addSectionBtn: "",
    addTaskPlaceholder: () => "", emptyTasks: "", emptyAll: "",
    noun: "event", nounCap: "Event"
  }
};

function isCollapsed(id) {
  try { return window.localStorage.getItem(LS_COLLAPSED_PREFIX + id) === "1"; } catch (e) { return false; }
}
function setCollapsed(id, val) {
  try {
    if (val) window.localStorage.setItem(LS_COLLAPSED_PREFIX + id, "1");
    else window.localStorage.removeItem(LS_COLLAPSED_PREFIX + id);
  } catch (e) { /* per-browser convenience only */ }
}
function isHideDone(pageId) {
  try { return window.localStorage.getItem(LS_HIDE_DONE_PREFIX + pageId) === "1"; } catch (e) { return false; }
}
function setHideDone(pageId, val) {
  try {
    if (val) window.localStorage.setItem(LS_HIDE_DONE_PREFIX + pageId, "1");
    else window.localStorage.removeItem(LS_HIDE_DONE_PREFIX + pageId);
  } catch (e) { /* per-browser convenience only */ }
}
function getStoredActivePage() {
  try { return window.localStorage.getItem(LS_ACTIVE_PAGE); } catch (e) { return null; }
}
function setStoredActivePage(id) {
  try { window.localStorage.setItem(LS_ACTIVE_PAGE, id); } catch (e) { /* non-fatal */ }
}

// "$450" for a whole dollar amount, "$450.50" for cents, with thousand
// separators — null/0/unset all render as nothing (no badge, no stat).
function formatMoney(n) {
  if (n === null || n === undefined || n === "") return null;
  const num = Number(n);
  if (!isFinite(num) || num <= 0) return null;
  return "$" + num.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 });
}

export function initUI(store, ai) {
  const tabsEl = document.getElementById("tabs");
  const pageTitleInput = document.getElementById("page-title");
  const deletePageBtn = document.getElementById("delete-page-btn");
  const addPageForm = document.getElementById("add-page-form");
  const newPageName = document.getElementById("new-page-name");
  const newPageType = document.getElementById("new-page-type");
  const addPageConfirm = document.getElementById("add-page-confirm");
  const addPageCancel = document.getElementById("add-page-cancel");

  const sectionsEl = document.getElementById("sections");
  const summaryEl = document.getElementById("summary");
  const listSearchWrap = document.getElementById("list-search-wrap");
  const listSearchInput = document.getElementById("list-search-input");
  const listSearchClear = document.getElementById("list-search-clear");
  const statusEl = document.getElementById("status");
  const addSectionPanel = document.getElementById("add-section-panel");
  const newSectionInput = document.getElementById("new-section");
  const addSectionBtn = document.getElementById("add-section-btn");
  const hideDoneBtn = document.getElementById("hide-done-btn");
  const collapseAllBtn = document.getElementById("collapse-all-btn");
  const reviewBtn = document.getElementById("review-btn");
  const reviewPanel = document.getElementById("review-panel");
  const reviewBody = document.getElementById("review-body");
  const reviewStopBtn = document.getElementById("review-stop");
  const reviewCloseBtn = document.getElementById("review-close");
  const settingsBtn = document.getElementById("settings-btn");
  const voiceBtn = document.getElementById("voice-btn");
  const todayBtn = document.getElementById("today-btn");
  const todayPanel = document.getElementById("today-panel");
  const todayBody = document.getElementById("today-body");
  const todayCloseBtn = document.getElementById("today-close");

  const sharePageBtn = document.getElementById("share-page-btn");
  const shareOverlay = document.getElementById("share-overlay");
  const sharePageName = document.getElementById("share-page-name");
  const shareClose = document.getElementById("share-close");
  const shareDoneBtn = document.getElementById("share-done-btn");
  const shareNotConfigured = document.getElementById("share-not-configured");
  const shareSignedOut = document.getElementById("share-signed-out");
  const shareUnshared = document.getElementById("share-unshared");
  const shareUnsharedHelp = document.getElementById("share-unshared-help");
  const shareGenerateBtn = document.getElementById("share-generate-btn");
  const shareShared = document.getElementById("share-shared");
  const shareSharedHelp = document.getElementById("share-shared-help");
  const shareInviteCode = document.getElementById("share-invite-code");
  const shareCopyBtn = document.getElementById("share-copy-btn");
  const shareMemberCount = document.getElementById("share-member-count");
  const shareStopBtn = document.getElementById("share-stop-btn");
  const shareLeaveBtn = document.getElementById("share-leave-btn");
  const shareStatus = document.getElementById("share-status");

  const calendarLinksBtn = document.getElementById("calendar-links-btn");
  const calendarLinksOverlay = document.getElementById("calendar-links-overlay");
  const calendarLinksPageName = document.getElementById("calendar-links-page-name");
  const calendarLinksClose = document.getElementById("calendar-links-close");
  const calendarLinksDoneBtn = document.getElementById("calendar-links-done-btn");
  const calendarLinkedListRows = document.getElementById("calendar-linked-list-rows");
  const calendarNoLinks = document.getElementById("calendar-no-links");
  const calendarLinkSelect = document.getElementById("calendar-link-select");
  const calendarLinkAddBtn = document.getElementById("calendar-link-add-btn");
  const calendarLinkAddEmpty = document.getElementById("calendar-link-add-empty");
  const calendarSharePrompt = document.getElementById("calendar-share-prompt");
  const calendarSharePromptText = document.getElementById("calendar-share-prompt-text");
  const calendarShareYesBtn = document.getElementById("calendar-share-yes-btn");
  const calendarShareNoBtn = document.getElementById("calendar-share-no-btn");
  const calendarLinksStatus = document.getElementById("calendar-links-status");

  const calendarDayOverlay = document.getElementById("calendar-day-overlay");
  const calendarDayTitle = document.getElementById("calendar-day-title");
  const calendarDayClose = document.getElementById("calendar-day-close");
  const calendarDayDoneBtn = document.getElementById("calendar-day-done-btn");
  const calendarDayFullEvents = document.getElementById("calendar-day-full-events");

  const openDetailsIds = {};
  let reviewCtl = null;
  let activeRecognizer = null;
  let activePageId = getStoredActivePage();
  // Family calendar view state — kept here rather than in the store since
  // it's purely local display state (which month you're looking at, which
  // day is selected for the quick-add form), not data anyone else needs to
  // see. Keyed by pageId so switching between two calendars remembers each
  // one's own month.
  const calendarViewMonths = {};
  let calendarSelectedDate = null;
  // Which date's "+N more" popup is currently open (null = closed). Kept
  // here, not just as a DOM hidden flag, so the popup's own content can be
  // rebuilt on the next render (e.g. after checking something off inside
  // it) without losing track of which day it's showing.
  let calendarDayPopupDate = null;
  let lastResolvedLinksForPageId = null;
  let pendingLinkListId = null;
  // Set right before a toggle that should celebrate, and consumed inside the
  // very next render pass (store.toggleTaskDone triggers that render
  // synchronously, rebuilding the DOM — so the celebration has to be applied
  // to the freshly-built row, not the one the click happened on, which is
  // gone by the time control returns here).
  let pendingCelebrationId = null;
  // Live search/quick-add, scoped to whichever page is active. Cleared
  // automatically on page switch (see render()) so a search typed on one
  // list never silently carries over and filters a different one.
  let searchQuery = "";
  let searchContextPageId = null;

  // Plain case-insensitive substring match — used for the live filter as
  // you type, since it needs to be predictable (what you see is what's
  // really in the text) rather than forgiving. The fuzzier findBestMatch
  // (same matcher voice commands use) is reserved for deciding what Enter
  // does, where "fuzzy enough to find the item" is exactly the point.
  function taskMatchesQuery(text, query) {
    return (text || "").toLowerCase().includes(query.toLowerCase());
  }

  function clearSearch() {
    searchQuery = "";
    if (listSearchInput) listSearchInput.value = "";
    if (listSearchClear) listSearchClear.hidden = true;
  }

  function setStatus(msg, warn) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("warn", !!warn);
  }

  function runTaskAI(kind, taskData, sectionName, outputEl, btns, stopBtn) {
    const prompts = {
      breakdown: "Break this task into 3-6 concrete, ordered sub-steps. Be specific and practical, no fluff. Reply with just a short numbered list.\n\nTask: \"" + taskData.text + "\"\nBusiness: " + sectionName + (taskData.dueDate ? ("\nDue: " + taskData.dueDate) : ""),
      draft: "Write a first draft of whatever this task is asking to produce (copy, a message, an outline — infer the right format from the task). Keep it ready to use with light editing, and keep it reasonably short.\n\nTask: \"" + taskData.text + "\"\nBusiness: " + sectionName,
      blocked: "In 2-4 sentences: think through what could realistically be blocking or complicating this task, then suggest the single most useful next step to unstick it.\n\nTask: \"" + taskData.text + "\"\nBusiness: " + sectionName
    };
    const prompt = prompts[kind];
    if (!prompt) return;

    btns.forEach((b) => { b.disabled = true; });
    outputEl.hidden = false;
    outputEl.textContent = "Thinking…";
    stopBtn.hidden = false;
    const ctl = new AbortController();
    stopBtn.onclick = () => ctl.abort();

    ai.ask(prompt, { signal: ctl.signal }).then((res) => {
      outputEl.textContent = res.text;
    }).catch((e) => {
      if (e && e.name === "AbortError") outputEl.textContent = "Stopped.";
      else outputEl.textContent = (e && e.message) || "Couldn't get an answer right now.";
    }).finally(() => {
      btns.forEach((b) => { b.disabled = false; });
      stopBtn.hidden = true;
    });
  }

  function runWeeklyReview() {
    if (!ai.isConfigured()) { setStatus("Connect an AI provider in Settings first.", true); return; }
    const state = store.getState();
    const page = activePage(state);
    const sections = state.sections.filter((s) => s.pageId === page.id);
    const tasks = state.tasks.filter((t) => t.pageId === page.id);

    reviewPanel.hidden = false;
    reviewBody.textContent = "Thinking…";
    reviewStopBtn.hidden = false;
    reviewBtn.disabled = true;

    const blocks = sections.slice().sort((a, b) => a.order - b.order).map((s) => {
      const sTasks = tasks.filter((t) => t.sectionId === s.id);
      const open = sTasks.filter((t) => !t.done).length;
      const doneWeek = sTasks.filter((t) => t.done && t.completedAt && daysSince(t.completedAt) <= 7).length;
      const stalled = sTasks.filter((t) => !t.done && !t.isSomeday && t.updatedAt && daysSince(t.updatedAt) >= STALE_DAYS).map((t) => t.text);
      const dueSoon = sTasks.filter((t) => {
        if (t.done || !t.dueDate) return false;
        const diff = daysUntil(t.dueDate);
        return diff !== null && diff <= 3;
      }).map((t) => t.text);
      return (s.name || "Untitled") + " — open: " + open + ", completed last 7 days: " + doneWeek
        + ", stalled 7+ days: " + stalled.length + (stalled.length ? (" (" + stalled.slice(0, 5).join("; ") + ")") : "")
        + ", due within 3 days: " + dueSoon.length + (dueSoon.length ? (" (" + dueSoon.join("; ") + ")") : "");
    });

    const prompt = "You're a concise productivity assistant. Here is the current state of someone's \"" + (page.name || "Untitled") + "\" list, one line per section:\n\n"
      + blocks.join("\n")
      + "\n\nWrite a short, friendly weekly review in plain text (no markdown headers): one line overall read, then 2-4 short highlights (wins, stale spots, anything due soon worth prioritizing), then one concrete suggestion for next week. Keep it under 150 words.";

    reviewCtl = new AbortController();
    ai.ask(prompt, { signal: reviewCtl.signal }).then((res) => {
      reviewBody.textContent = res.text;
    }).catch((e) => {
      if (e && e.name === "AbortError") reviewBody.textContent = "Stopped.";
      else reviewBody.textContent = (e && e.message) || "Couldn't generate the review right now.";
    }).finally(() => {
      reviewBtn.disabled = false;
      reviewStopBtn.hidden = true;
    });
  }

  function startVoiceCommand() {
    if (activeRecognizer) return; // already listening — ignore a second click
    voiceBtn.classList.add("listening");
    voiceBtn.textContent = "🎙️ Listening…";
    setStatus("Listening…");
    activeRecognizer = listenOnce({
      onResult: (transcript) => handleVoiceTranscript(transcript),
      onError: (msg) => setStatus(msg, true),
      onEnd: () => {
        activeRecognizer = null;
        voiceBtn.classList.remove("listening");
        voiceBtn.textContent = "🎤 Voice";
      }
    });
  }

  async function handleVoiceTranscript(transcript) {
    const state = store.getState();
    const page = activePage(state);
    if (!page) return;
    const labels = PAGE_LABELS[page.type] || PAGE_LABELS.tasks;
    const cmd = parseCommand(transcript);

    if (cmd.type === "empty") {
      setStatus("Didn't catch that — try again.", true);
      return;
    }
    if (cmd.type === "unrecognized") {
      setStatus("Didn't understand \"" + cmd.raw + "\" — try \"add milk to produce\" or \"check off bananas\".", true);
      return;
    }

    const sections = state.sections.filter((s) => s.pageId === page.id);
    const tasks = state.tasks.filter((t) => t.pageId === page.id);

    if (cmd.type === "add") {
      let targetSection = null;
      let how = "";
      if (cmd.section) {
        const m = findBestMatch(sections, cmd.section, "name");
        if (!m) { setStatus("Couldn't find a " + labels.noun + " called \"" + cmd.section + "\".", true); return; }
        targetSection = m.item;
      } else if (sections.length === 1) {
        targetSection = sections[0];
      } else if (sections.length === 0) {
        setStatus("Add a " + labels.noun + " first, then try again.", true);
        return;
      } else if (page.type === "grocery") {
        // No category named ("add milk") and there's more than one —
        // guess instead of making the user say "add milk to dairy".
        const guess = await resolveGroceryCategory(sections, cmd.text);
        targetSection = guess.section;
        how = guess.matched ? (guess.viaAI ? " (AI-categorized)" : "") : "";
      } else {
        setStatus("Which " + labels.noun + "? Try \"add " + cmd.text + " to <name>\".", true);
        return;
      }
      store.addTask(targetSection.id, cmd.text);
      setStatus("Added \"" + cmd.text + "\" to " + (targetSection.name || "Untitled") + how + ".");
      return;
    }

    if (cmd.type === "check") {
      const open = tasks.filter((t) => !t.done);
      const m = findBestMatch(open, cmd.target, "text");
      if (!m) { setStatus("Couldn't find an open item like \"" + cmd.target + "\" to check off.", true); return; }
      pendingCelebrationId = page.type !== "grocery" ? m.item.id : null;
      store.toggleTaskDone(m.item.id);
      setStatus("Checked off \"" + m.item.text + "\".");
      return;
    }

    if (cmd.type === "uncheck") {
      const done = tasks.filter((t) => t.done);
      const m = findBestMatch(done, cmd.target, "text");
      if (!m) { setStatus("Couldn't find a checked-off item like \"" + cmd.target + "\" to uncheck.", true); return; }
      store.toggleTaskDone(m.item.id);
      setStatus("Unchecked \"" + m.item.text + "\".");
      return;
    }
  }

  // Touch devices can't drag-and-drop (see the move-btns CSS), so this pair
  // of up/down buttons is the touch equivalent for reordering — same idea
  // for both sections and tasks-within-a-section, just given a different
  // pair of callbacks and labels by the two call sites below.
  function buildMoveBtns(label, canUp, canDown, onUp, onDown) {
    const wrap = document.createElement("span");
    wrap.className = "move-btns";
    const up = document.createElement("button");
    up.type = "button";
    up.className = "move-btn";
    up.textContent = "↑";
    up.setAttribute("aria-label", "Move " + label + " up");
    up.disabled = !canUp;
    up.addEventListener("click", onUp);
    const down = document.createElement("button");
    down.type = "button";
    down.className = "move-btn";
    down.textContent = "↓";
    down.setAttribute("aria-label", "Move " + label + " down");
    down.disabled = !canDown;
    down.addEventListener("click", onDown);
    wrap.appendChild(up);
    wrap.appendChild(down);
    return wrap;
  }

  function celebrate(wrap, checkEl) {
    const phrase = CELEBRATE_PHRASES[Math.floor(Math.random() * CELEBRATE_PHRASES.length)];
    const badge = document.createElement("span");
    badge.className = "celebrate-badge";
    badge.textContent = phrase;
    wrap.appendChild(badge);
    checkEl.classList.add("celebrate");
    const cleanup = () => { badge.remove(); checkEl.classList.remove("celebrate"); };
    badge.addEventListener("animationend", cleanup, { once: true });
    setTimeout(cleanup, 1300); // fallback in case animationend never fires
  }

  // Shown on a task row (and in the Today panel) when a client name and/or
  // dollar value have been set on it — see buildTaskDetailsPanel. Grocery
  // items never get these, same as due dates/recurrence.
  function appendClientValueBadges(row, task) {
    if (task.client) {
      const clientBadge = document.createElement("span");
      clientBadge.className = "client-badge";
      clientBadge.textContent = "👤 " + task.client;
      row.appendChild(clientBadge);
    }
    const money = formatMoney(task.value);
    if (money) {
      const valueBadge = document.createElement("span");
      valueBadge.className = "value-badge";
      valueBadge.textContent = money;
      row.appendChild(valueBadge);
    }
  }

  // --- Today view: everything overdue or due today, across every to-do
  // page (not just whichever one happens to be active). Kept entirely
  // separate from the AI weekly review — no AI connection needed, always
  // available — and recomputed on every render so checking something off
  // from in here (or anywhere else) is reflected immediately.
  function computeTodayItems(state) {
    const pageById = {};
    state.pages.forEach((p) => { pageById[p.id] = p; });
    const sectionById = {};
    state.sections.forEach((s) => { sectionById[s.id] = s; });

    const overdue = [];
    const dueToday = [];
    state.tasks.forEach((t) => {
      if (t.done || !t.dueDate) return;
      const page = pageById[t.pageId];
      if (!page || page.type === "grocery") return;
      const diff = daysUntil(t.dueDate);
      if (diff === null) return;
      const entry = { task: t, page: page, section: sectionById[t.sectionId] || null, diff: diff };
      if (diff < 0) overdue.push(entry);
      else if (diff === 0) dueToday.push(entry);
    });
    overdue.sort((a, b) => a.diff - b.diff); // most overdue first
    dueToday.sort((a, b) => (a.page.name || "").localeCompare(b.page.name || ""));
    return { overdue: overdue, dueToday: dueToday };
  }

  function buildTodayRow(entry) {
    const task = entry.task, page = entry.page, section = entry.section;
    const row = document.createElement("div");
    row.className = "today-row";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "check";
    check.setAttribute("aria-label", "Mark \"" + task.text + "\" as done");
    check.addEventListener("change", () => store.toggleTaskDone(task.id));
    row.appendChild(check);

    const text = document.createElement("span");
    text.className = "today-row-text";
    text.textContent = task.text || "";
    row.appendChild(text);

    const due = dueBadgeInfo(task.dueDate);
    if (due) {
      const dueBadge = document.createElement("span");
      dueBadge.className = "due-badge" + (due.cls ? " " + due.cls : "");
      dueBadge.textContent = due.text;
      row.appendChild(dueBadge);
    }
    appendClientValueBadges(row, task);

    const pageTag = document.createElement("button");
    pageTag.type = "button";
    pageTag.className = "today-page-tag";
    pageTag.textContent = (page.name || "Untitled") + (section ? " · " + (section.name || "Untitled") : "");
    pageTag.title = "Jump to " + (page.name || "Untitled");
    pageTag.addEventListener("click", () => {
      activePageId = page.id;
      setStoredActivePage(page.id);
      todayPanel.hidden = true;
      render(store.getState());
    });
    row.appendChild(pageTag);

    todayBody.appendChild(row);
  }

  function renderTodayPanel(state) {
    const items = computeTodayItems(state);
    const total = items.overdue.length + items.dueToday.length;

    // The count badge on the button itself stays current whether or not the
    // panel is open, so it's useful at a glance without opening anything.
    let countEl = todayBtn.querySelector(".today-btn-count");
    if (total > 0) {
      if (!countEl) {
        countEl = document.createElement("span");
        countEl.className = "today-btn-count";
        todayBtn.appendChild(countEl);
      }
      countEl.textContent = String(total);
    } else if (countEl) {
      countEl.remove();
    }

    if (todayPanel.hidden) return; // no need to build the body while closed

    todayBody.innerHTML = "";
    if (total === 0) {
      const empty = document.createElement("div");
      empty.className = "today-empty";
      empty.textContent = "Nothing overdue or due today across any of your pages.";
      todayBody.appendChild(empty);
      return;
    }

    function buildGroup(title, entries) {
      if (!entries.length) return;
      const groupTitle = document.createElement("div");
      groupTitle.className = "today-group-title";
      groupTitle.textContent = title + " (" + entries.length + ")";
      todayBody.appendChild(groupTitle);
      entries.forEach(buildTodayRow);
    }

    buildGroup("Overdue", items.overdue);
    buildGroup("Due today", items.dueToday);
  }

  function buildTaskRow(task, sectionId, sectionName, otherSections, isGrocery, siblingList, idx) {
    const beforeTaskIdForDrop = siblingList[idx + 1] ? siblingList[idx + 1].id : null;
    const wrap = document.createElement("li");
    wrap.className = "row-wrap" + (task.done ? " done" : "") + (!isGrocery && task.isSomeday ? " someday" : "");
    wrap.draggable = true;
    wrap.style.borderLeftColor = task.color || "transparent";

    wrap.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "task", taskId: task.id, from: sectionId }));
      wrap.classList.add("dragging");
    });
    wrap.addEventListener("dragend", () => wrap.classList.remove("dragging"));

    // Row-level drop target: lets a task be reordered within its own section,
    // or dropped at a precise position in a different section — not just
    // appended to the end of whichever card it lands on.
    wrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      wrap.classList.add("drag-over-row");
    });
    wrap.addEventListener("dragleave", (e) => {
      if (!wrap.contains(e.relatedTarget)) wrap.classList.remove("drag-over-row");
    });
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove("drag-over-row");
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw) return;
      let payload;
      try { payload = JSON.parse(raw); } catch (err) { return; }
      if (!payload || payload.kind !== "task" || !payload.taskId || payload.taskId === task.id) return;
      const rect = wrap.getBoundingClientRect();
      const dropBefore = e.clientY < rect.top + rect.height / 2;
      store.reorderTaskInSection(payload.taskId, sectionId, dropBefore ? task.id : beforeTaskIdForDrop);
    });

    const row = document.createElement("div");
    row.className = "row";

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "⋮⋮";

    const moveBtns = buildMoveBtns(
      "\"" + (task.text || "item") + "\"",
      idx > 0,
      idx < siblingList.length - 1,
      () => store.reorderTaskInSection(task.id, sectionId, siblingList[idx - 1] ? siblingList[idx - 1].id : null),
      () => store.reorderTaskInSection(task.id, sectionId, siblingList[idx + 2] ? siblingList[idx + 2].id : null)
    );

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "color-swatch small";
    colorInput.value = task.color || TASK_COLOR_DEFAULT;
    colorInput.setAttribute("aria-label", "Color tag for \"" + task.text + "\"");
    colorInput.addEventListener("input", () => { wrap.style.borderLeftColor = colorInput.value; });
    colorInput.addEventListener("change", () => store.updateTask(task.id, { color: colorInput.value }));

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "check";
    check.checked = !!task.done;
    check.id = "check-" + task.id;
    check.setAttribute("aria-label", "Mark \"" + task.text + "\" as " + (task.done ? "not done" : "done"));
    check.addEventListener("change", () => {
      const next = check.checked;
      pendingCelebrationId = (!isGrocery && next && !task.done) ? task.id : null;
      store.toggleTaskDone(task.id); // triggers a synchronous re-render — see pendingCelebrationId above
    });

    if (pendingCelebrationId === task.id) {
      pendingCelebrationId = null;
      celebrate(wrap, check);
    }

    const label = document.createElement("label");
    label.className = "row-text";
    label.setAttribute("for", check.id);
    label.textContent = task.text || "";

    row.appendChild(handle);
    row.appendChild(moveBtns);
    row.appendChild(check);
    row.appendChild(colorInput);
    row.appendChild(label);

    if (!isGrocery) {
      const due = dueBadgeInfo(task.dueDate);
      if (due) {
        const dueBadge = document.createElement("span");
        dueBadge.className = "due-badge" + (due.cls ? " " + due.cls : "");
        dueBadge.textContent = due.text;
        row.appendChild(dueBadge);
      }
      if (task.recurrence) {
        const recurBadge = document.createElement("span");
        recurBadge.className = "recur-badge";
        recurBadge.title = recurrenceLabel(task.recurrence) || "Repeats";
        recurBadge.setAttribute("aria-label", "Repeating task");
        recurBadge.textContent = "↻";
        row.appendChild(recurBadge);
      }
      if (task.isDaily) {
        const dailyBadge = document.createElement("span");
        dailyBadge.className = "recur-badge daily-badge";
        dailyBadge.title = "Daily task — resets automatically each day";
        dailyBadge.setAttribute("aria-label", "Daily task");
        dailyBadge.textContent = "☀";
        row.appendChild(dailyBadge);
      }
      appendClientValueBadges(row, task);
    } else if (otherSections.length) {
      // Grocery items are stripped down to name / category / checkbox /
      // color, but reassigning the category stays available right on the
      // row instead of being hidden behind a details panel.
      const categorySelect = document.createElement("select");
      categorySelect.className = "category-select";
      categorySelect.setAttribute("aria-label", "Category for \"" + task.text + "\"");
      const current = document.createElement("option");
      current.value = sectionId;
      current.textContent = sectionName;
      current.selected = true;
      categorySelect.appendChild(current);
      otherSections.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        categorySelect.appendChild(opt);
      });
      categorySelect.addEventListener("change", () => {
        if (categorySelect.value && categorySelect.value !== sectionId) store.moveTask(task.id, categorySelect.value);
      });
      row.appendChild(categorySelect);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.setAttribute("aria-label", "Delete \"" + task.text + "\"");
    del.textContent = "×";
    del.addEventListener("click", () => store.deleteTask(task.id));

    if (!isGrocery) {
      const detailsToggle = document.createElement("button");
      detailsToggle.type = "button";
      detailsToggle.className = "details-toggle";
      detailsToggle.textContent = "⋯";
      detailsToggle.setAttribute("aria-label", "Details for \"" + task.text + "\"");
      row.appendChild(detailsToggle);
      row.appendChild(del);
      wrap.appendChild(row);
      buildTaskDetailsPanel(wrap, task, sectionId, otherSections, sectionName, detailsToggle);
    } else {
      row.appendChild(del);
      wrap.appendChild(row);
    }

    return wrap;
  }

  function buildTaskDetailsPanel(wrap, task, sectionId, otherSections, sectionName, detailsToggle) {
    const panel = document.createElement("div");
    panel.className = "task-details";
    panel.hidden = !openDetailsIds[task.id];

    const controls = document.createElement("div");
    controls.className = "detail-row";

    const dueField = document.createElement("div");
    dueField.className = "detail-field";
    const dueLabel = document.createElement("span");
    dueLabel.className = "detail-label";
    dueLabel.textContent = "Due";
    const dueInput = document.createElement("input");
    dueInput.type = "date";
    dueInput.value = task.dueDate || "";
    dueInput.addEventListener("change", () => store.updateTask(task.id, { dueDate: dueInput.value || null }));
    dueField.appendChild(dueLabel);
    dueField.appendChild(dueInput);

    const recurField = document.createElement("div");
    recurField.className = "detail-field";
    const recurLabel = document.createElement("span");
    recurLabel.className = "detail-label";
    recurLabel.textContent = "Repeat";
    const RECUR_OPTIONS = [
      ["none", "Doesn't repeat"],
      ["daily", "Every day"],
      ["weekdays", "Every weekday (Mon–Fri)"],
      ["weekend", "Weekends (Sat–Sun)"],
      ["weekly", "Weekly"],
      ["monthly", "Monthly"],
      ["custom", "Custom days…"]
    ];
    const recurSelect = document.createElement("select");
    RECUR_OPTIONS.forEach(([v, label]) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = label;
      recurSelect.appendChild(opt);
    });
    recurSelect.value = recurrenceValue(task.recurrence);
    recurSelect.addEventListener("change", () => {
      const val = recurSelect.value;
      // Switching TO "custom" keeps whatever specific days were already
      // chosen last time (if any) rather than wiping them back to none —
      // the checkbox row below re-reads task.recurrence.days on its own
      // next render, same as everything else in this panel.
      const existingCustomDays = (task.recurrence && task.recurrence.unit === "custom" && Array.isArray(task.recurrence.days)) ? task.recurrence.days : [];
      const recurrence = val === "custom" ? recurrenceFromValue(val, existingCustomDays) : recurrenceFromValue(val);
      // A recurring task spawns a fresh row each time it's completed — a
      // "Daily task" instead resets the SAME row in place (see the Daily
      // field below). Mixing the two mechanics on one task would be
      // ambiguous, so picking a real repeat option here turns Daily off.
      store.updateTask(task.id, recurrence ? { recurrence, isDaily: false } : { recurrence });
    });
    recurField.appendChild(recurLabel);
    recurField.appendChild(recurSelect);

    const somedayField = document.createElement("label");
    somedayField.className = "someday-field";
    const somedayCheck = document.createElement("input");
    somedayCheck.type = "checkbox";
    somedayCheck.checked = !!task.isSomeday;
    somedayCheck.addEventListener("change", () => store.updateTask(task.id, { isSomeday: somedayCheck.checked }));
    somedayField.appendChild(somedayCheck);
    somedayField.appendChild(document.createTextNode("Someday / low priority"));

    // "Daily task": a single persistent row meant to be checked off once
    // per calendar day — e.g. a daily posting habit. Unlike Repeat above,
    // completing it does NOT spawn a new row; it just quietly flips back
    // to unchecked once the day rolls over (see store.js's
    // resetDailyTasks), ready to check off again tomorrow.
    const dailyField = document.createElement("label");
    dailyField.className = "someday-field daily-field";
    const dailyCheck = document.createElement("input");
    dailyCheck.type = "checkbox";
    dailyCheck.checked = !!task.isDaily;
    dailyCheck.addEventListener("change", () => {
      const isDaily = dailyCheck.checked;
      store.updateTask(task.id, isDaily ? { isDaily: true, recurrence: null } : { isDaily: false });
    });
    dailyField.appendChild(dailyCheck);
    dailyField.appendChild(document.createTextNode("Daily task (resets each day)"));

    controls.appendChild(dueField);
    controls.appendChild(recurField);
    controls.appendChild(somedayField);
    controls.appendChild(dailyField);

    if (otherSections.length) {
      const moveField = document.createElement("div");
      moveField.className = "detail-field";
      const moveLabel = document.createElement("span");
      moveLabel.className = "detail-label";
      moveLabel.textContent = "Move";
      const move = document.createElement("select");
      move.className = "move-select";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "…";
      placeholder.disabled = true;
      placeholder.selected = true;
      move.appendChild(placeholder);
      otherSections.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        move.appendChild(opt);
      });
      move.addEventListener("change", () => { if (move.value) store.moveTask(task.id, move.value); });
      moveField.appendChild(moveLabel);
      moveField.appendChild(move);
      controls.appendChild(moveField);
    }

    panel.appendChild(controls);

    // "Custom days" repeat row — a little checkbox-per-weekday picker,
    // only shown when Repeat is actually set to "custom" (e.g. "every
    // Monday and Thursday"). Kept as its own row below the main controls
    // rather than crammed into recurField itself, since seven checkboxes
    // don't fit next to a <select> without wrapping awkwardly.
    const customDaysRow = document.createElement("div");
    customDaysRow.className = "detail-row custom-days-row";
    customDaysRow.hidden = recurrenceValue(task.recurrence) !== "custom";
    const customDaysLabel = document.createElement("span");
    customDaysLabel.className = "detail-label";
    customDaysLabel.textContent = "Which days";
    customDaysRow.appendChild(customDaysLabel);
    const selectedCustomDays = (task.recurrence && task.recurrence.unit === "custom" && Array.isArray(task.recurrence.days)) ? task.recurrence.days : [];
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((dayName, dayIndex) => {
      const dayField = document.createElement("label");
      dayField.className = "custom-day-check";
      const dayCheck = document.createElement("input");
      dayCheck.type = "checkbox";
      dayCheck.checked = selectedCustomDays.includes(dayIndex);
      dayCheck.addEventListener("change", () => {
        // Each checkbox's position in the row IS its weekday index (0=Sun
        // through 6=Sat — the same order they were created in above), so
        // reading all seven back by index is enough to rebuild the set.
        const nowChecked = Array.from(customDaysRow.querySelectorAll('input[type="checkbox"]'))
          .map((el, i) => (el.checked ? i : -1))
          .filter((i) => i !== -1);
        store.updateTask(task.id, { recurrence: recurrenceFromValue("custom", nowChecked), isDaily: false });
      });
      dayField.appendChild(dayCheck);
      dayField.appendChild(document.createTextNode(dayName));
      customDaysRow.appendChild(dayField);
    });
    recurSelect.addEventListener("change", () => { customDaysRow.hidden = recurSelect.value !== "custom"; });
    panel.appendChild(customDaysRow);

    // A second row, kept separate from due/repeat/someday/move above so it
    // doesn't get too crowded — client + dollar value, both optional, for
    // tying a task to freelance/client work. Neither applies to grocery
    // items (this whole panel isn't built for those — see buildTaskRow).
    const clientValueRow = document.createElement("div");
    clientValueRow.className = "detail-row";

    const clientField = document.createElement("div");
    clientField.className = "detail-field";
    const clientLabel = document.createElement("span");
    clientLabel.className = "detail-label";
    clientLabel.textContent = "Client";
    const clientInput = document.createElement("input");
    clientInput.type = "text";
    clientInput.placeholder = "Client name";
    clientInput.maxLength = 60;
    clientInput.value = task.client || "";
    clientInput.addEventListener("change", () => store.updateTask(task.id, { client: clientInput.value.trim() || null }));
    clientField.appendChild(clientLabel);
    clientField.appendChild(clientInput);

    const valueField = document.createElement("div");
    valueField.className = "detail-field";
    const valueLabel = document.createElement("span");
    valueLabel.className = "detail-label";
    valueLabel.textContent = "Value";
    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.min = "0";
    valueInput.step = "0.01";
    valueInput.placeholder = "0.00";
    valueInput.value = task.value != null ? task.value : "";
    valueInput.addEventListener("change", () => {
      const v = parseFloat(valueInput.value);
      store.updateTask(task.id, { value: isFinite(v) && v > 0 ? v : null });
    });
    valueField.appendChild(valueLabel);
    valueField.appendChild(valueInput);

    clientValueRow.appendChild(clientField);
    clientValueRow.appendChild(valueField);
    panel.appendChild(clientValueRow);

    if (ai.isConfigured()) {
      const aiRow = document.createElement("div");
      aiRow.className = "ai-actions";
      const aiOutput = document.createElement("div");
      aiOutput.className = "ai-output";
      aiOutput.hidden = true;
      const aiStop = document.createElement("button");
      aiStop.type = "button";
      aiStop.className = "stop-btn";
      aiStop.textContent = "Stop";
      aiStop.hidden = true;

      const aiBtns = [];
      [["breakdown", "Break it down"], ["draft", "Draft it"], ["blocked", "What's blocking this?"]].forEach(([kind, label2]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ai-btn";
        b.textContent = label2;
        b.addEventListener("click", () => runTaskAI(kind, task, sectionName, aiOutput, aiBtns, aiStop));
        aiBtns.push(b);
        aiRow.appendChild(b);
      });

      panel.appendChild(aiRow);
      panel.appendChild(aiOutput);
      panel.appendChild(aiStop);
    } else {
      const note = document.createElement("p");
      note.className = "ai-off-note";
      const link = document.createElement("button");
      link.type = "button";
      link.textContent = "Connect an AI provider in Settings";
      link.addEventListener("click", () => settingsBtn.click());
      note.appendChild(document.createTextNode("No AI co-pilot connected. "));
      note.appendChild(link);
      note.appendChild(document.createTextNode(" to get break-it-down / draft / unblock help on this task."));
      panel.appendChild(note);
    }

    wrap.appendChild(panel);

    detailsToggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) detailsToggle.classList.add("open");
    detailsToggle.addEventListener("click", () => {
      const nowOpen = panel.hidden;
      panel.hidden = !nowOpen;
      detailsToggle.classList.toggle("open", nowOpen);
      detailsToggle.setAttribute("aria-expanded", String(nowOpen));
      if (nowOpen) openDetailsIds[task.id] = true; else delete openDetailsIds[task.id];
    });
  }

  function wireAddTask(form, input, btn, sectionId) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      store.addTask(sectionId, text);
      input.value = "";
      input.focus();
    });
  }

  // Grocery auto-categorization: guesses which existing category a brand
  // new item belongs to, so it can land in the right place without the
  // user picking a category by hand first (the category-select dropdown
  // on each row is still right there afterward if a guess is ever wrong).
  // Tries the built-in keyword map first — instant, no network, and good
  // enough for the vast majority of common grocery items — and only asks
  // the connected AI provider, if there is one, as a fallback for
  // anything the map doesn't recognize. Always resolves to SOME section
  // to add into; when nothing matches at all it falls back to the first
  // category, same default a plain add already used before this feature.
  async function resolveGroceryCategory(sections, text) {
    const byName = guessCategory(text, sections.map((s) => s.name));
    if (byName) {
      const match = sections.find((s) => s.name === byName);
      if (match) return { section: match, matched: true, viaAI: false };
    }
    if (ai.isConfigured()) {
      try {
        const names = sections.map((s) => s.name);
        const prompt =
          "A grocery list has these categories: " + names.join(", ") +
          ". Which single category does the item \"" + text + "\" belong in? " +
          "Reply with ONLY the exact category name from that list, nothing else.";
        const res = await ai.ask(prompt);
        const guess = (res || "").trim().replace(/^["'.]+|["'.]+$/g, "");
        const match = sections.find((s) => s.name.toLowerCase() === guess.toLowerCase());
        if (match) return { section: match, matched: true, viaAI: true };
      } catch {
        // No key, offline, rate-limited, unparseable reply — whatever it
        // is, fall through to the plain default below rather than
        // blocking the add on it.
      }
    }
    return { section: sections[0], matched: false, viaAI: false };
  }

  function wireDeleteSection(btn, sectionId, sectionTaskCount, labels) {
    let confirming = false;
    let revertTimer = null;
    btn.addEventListener("click", () => {
      if (!confirming) {
        confirming = true;
        btn.classList.add("confirm");
        btn.textContent = sectionTaskCount
          ? "Delete " + labels.noun + " + " + sectionTaskCount + " item" + (sectionTaskCount === 1 ? "" : "s") + "?"
          : "Delete " + labels.noun + "?";
        revertTimer = setTimeout(() => {
          confirming = false;
          btn.classList.remove("confirm");
          btn.textContent = "Delete";
        }, 4000);
        return;
      }
      clearTimeout(revertTimer);
      store.deleteSection(sectionId);
    });
  }

  function sectionHealth(sectionTasks) {
    if (!sectionTasks.length) return null;
    let lastTs = null;
    sectionTasks.forEach((t) => {
      const u = t.updatedAt || t.createdAt;
      if (u && (!lastTs || u > lastTs)) lastTs = u;
    });
    const doneWeek = sectionTasks.filter((t) => t.done && t.completedAt && daysSince(t.completedAt) <= 7).length;
    const stalled = sectionTasks.filter((t) => !t.done && !t.isSomeday && t.updatedAt && daysSince(t.updatedAt) >= STALE_DAYS).length;
    const openValue = sectionTasks.reduce((sum, t) => sum + (!t.done && t.value ? Number(t.value) : 0), 0);
    return { active: activityText(daysSince(lastTs)), doneWeek, stalled, openValue };
  }

  function activePage(state) {
    const pages = state.pages.slice().sort((a, b) => a.order - b.order);
    if (!pages.length) return null;
    let p = activePageId ? pages.find((x) => x.id === activePageId) : null;
    if (!p) p = pages[0];
    return p;
  }

  function renderTabs(state, page) {
    const pages = state.pages.slice().sort((a, b) => a.order - b.order);
    tabsEl.innerHTML = "";
    pages.forEach((p) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab" + (p.id === page.id ? " active" : "");
      tab.textContent = (p.sharedPageId ? "\u{1F465} " : "") + (p.name || "Untitled");
      tab.title = (p.name || "Untitled") + (p.sharedPageId ? " (shared list)" : "");
      tab.addEventListener("click", () => {
        if (activePageId === p.id) return;
        activePageId = p.id;
        setStoredActivePage(p.id);
        addPageForm.hidden = true;
        render(store.getState());
      });
      tabsEl.appendChild(tab);
    });
    const addTab = document.createElement("button");
    addTab.type = "button";
    addTab.className = "tab-add";
    addTab.textContent = "+";
    addTab.setAttribute("aria-label", "Add a page");
    addTab.addEventListener("click", () => {
      addPageForm.hidden = !addPageForm.hidden;
      if (!addPageForm.hidden) { newPageName.value = ""; newPageName.focus(); }
    });
    tabsEl.appendChild(addTab);
  }

  // --- Family calendar (page.type === "calendar") ---

  function getCalendarViewMonth(pageId) {
    if (!calendarViewMonths[pageId]) {
      const now = new Date();
      calendarViewMonths[pageId] = { year: now.getFullYear(), month: now.getMonth() };
    }
    return calendarViewMonths[pageId];
  }

  function setCalendarViewMonth(pageId, year, month) {
    calendarViewMonths[pageId] = { year, month };
  }

  // Translates a shared calendar's linked lists (shared_pages ids) into
  // this account's own local page ids — see sync.js's resolveLinkedLists.
  // Deliberately called only once per "visit" to this calendar page (not
  // on every render while it's open), since it's a network round-trip and
  // its result (store.setLinkedLists) itself triggers another render.
  function maybeResolveLinkedLists(page) {
    if (lastResolvedLinksForPageId === page.id) return;
    lastResolvedLinksForPageId = page.id;
    if (page.sharedPageId) sync.resolveLinkedLists(page.id).catch(() => {});
  }

  function formatEventTime(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    if (!m) return hhmm || "";
    let h = parseInt(m[1], 10);
    const min = m[2];
    const suffix = h >= 12 ? "pm" : "am";
    h = h % 12; if (h === 0) h = 12;
    return h + (min === "00" ? "" : ":" + min) + suffix;
  }

  // entry = { task, editable, pageName, pageId } — editable (own-page)
  // events get an inline-renamable text field and a delete button;
  // entries pulled in from a linked list are read-only here (editing
  // belongs on the list itself) and instead get a little tag that jumps
  // to that list's page, same pattern as the Today panel's page tag.
  function buildCalendarEventChip(entry) {
    const task = entry.task;
    const chip = document.createElement("div");
    chip.className = "calendar-event-chip" + (task.done ? " is-done" : "") + (entry.virtual ? " is-virtual" : "");

    if (entry.virtual) {
      // A projected occurrence of a recurring event — there's no real task
      // behind THIS date, just the one anchor row the recurrence was set
      // on, so there's nothing here to check off, retype, or delete. A
      // small recurring glyph stands in for the checkbox instead.
      const recurGlyph = document.createElement("span");
      recurGlyph.className = "calendar-event-recur-glyph";
      recurGlyph.textContent = "↻";
      recurGlyph.title = "Repeating occurrence — edit or complete it from " + task.dueDate;
      chip.appendChild(recurGlyph);
    } else {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!task.done;
      check.setAttribute("aria-label", "Mark \"" + (task.text || "") + "\" done");
      check.addEventListener("change", () => store.toggleTaskDone(task.id));
      chip.appendChild(check);
    }

    if (task.eventTime) {
      const time = document.createElement("span");
      time.className = "calendar-event-time";
      time.textContent = formatEventTime(task.eventTime);
      chip.appendChild(time);
    }

    if (entry.editable) {
      const text = document.createElement("input");
      text.type = "text";
      text.className = "calendar-event-text-input";
      text.value = task.text || "";
      text.maxLength = 200;
      text.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); text.blur(); }
        else if (e.key === "Escape") { text.value = task.text || ""; text.blur(); }
      });
      text.addEventListener("blur", () => {
        const val = text.value.trim();
        if (!val) { text.value = task.text || ""; return; }
        if (val === task.text) return;
        store.updateTask(task.id, { text: val });
      });
      chip.appendChild(text);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "calendar-event-del";
      del.textContent = "×";
      del.setAttribute("aria-label", "Delete \"" + (task.text || "") + "\"");
      del.addEventListener("click", () => store.deleteTask(task.id));
      chip.appendChild(del);
    } else {
      const text = document.createElement("span");
      text.className = "calendar-event-text";
      text.textContent = task.text || "";
      chip.appendChild(text);

      // The jump-to-source tag only makes sense for an entry actually
      // pulled in from a linked list (entry.pageName set) — a virtual
      // projection of one of THIS calendar's own recurring events has
      // nowhere else to jump to.
      if (entry.pageName) {
        const tag = document.createElement("button");
        tag.type = "button";
        tag.className = "today-page-tag calendar-event-source";
        tag.textContent = entry.pageName;
        tag.title = "Jump to " + entry.pageName;
        tag.addEventListener("click", () => {
          activePageId = entry.pageId;
          setStoredActivePage(entry.pageId);
          render(store.getState());
        });
        chip.appendChild(tag);
      }
    }

    return chip;
  }

  // Keeps the "+N more" day popup's content current — called from inside
  // renderCalendarGrid on every render, not just when it's opened, so
  // checking/editing/deleting something from inside the popup (which
  // triggers a normal store-driven re-render) updates it live instead of
  // showing stale content or needing to be reopened.
  function renderCalendarDayPopup(byDate, holidaysByDate) {
    if (!calendarDayPopupDate) { calendarDayOverlay.hidden = true; return; }
    const entries = byDate[calendarDayPopupDate] || [];
    const holidayName = (holidaysByDate || {})[calendarDayPopupDate];
    const d = new Date(calendarDayPopupDate + "T00:00:00");
    const dateLabel = isNaN(d.getTime())
      ? "Events"
      : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    calendarDayTitle.textContent = holidayName ? dateLabel + " — " + holidayName : dateLabel;
    calendarDayFullEvents.innerHTML = "";
    if (entries.length === 0) {
      const none = document.createElement("p");
      none.className = "calendar-no-events";
      none.textContent = "Nothing on this day.";
      calendarDayFullEvents.appendChild(none);
    } else {
      entries.forEach((entry) => calendarDayFullEvents.appendChild(buildCalendarEventChip(entry)));
    }
    calendarDayOverlay.hidden = false;
  }

  function renderCalendarGrid(state, page, ownSections, ownTasks) {
    const view = getCalendarViewMonth(page.id);
    const year = view.year, month = view.month;

    const linkedIds = Array.isArray(page.linkedListIds) ? page.linkedListIds : [];
    const linkedPages = linkedIds.map((id) => state.pages.find((p) => p.id === id)).filter(Boolean);

    // Needed up here (rather than down with the rest of the grid-drawing
    // code below) because the recurrence-projection pass right below also
    // needs to know the visible date window — a recurring event only ever
    // gets virtual occurrences projected within the month actually on
    // screen, not forever into the future.
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
    const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41);
    const gridStartStr = fmtDate(gridStart);
    const gridEndStr = fmtDate(gridEnd);
    const today = todayStr();

    const byDate = {};
    ownTasks.filter((t) => t.dueDate).forEach((t) => {
      (byDate[t.dueDate] = byDate[t.dueDate] || []).push({ task: t, editable: true });
    });
    linkedPages.forEach((lp) => {
      state.tasks.filter((t) => t.pageId === lp.id && t.dueDate).forEach((t) => {
        (byDate[t.dueDate] = byDate[t.dueDate] || []).push({ task: t, editable: false, pageName: lp.name || "Untitled", pageId: lp.id });
      });
    });

    // Recurring calendar events (and recurring tasks pulled in from a
    // linked list) get virtual occurrences projected onto every other
    // matching date in the visible grid, in addition to their one real
    // "anchor" row — e.g. a weekly "Trash day" event shows on every
    // Tuesday of the month, not just the Tuesday it was created on. These
    // projections are display-only: there's no real task behind them, so
    // buildCalendarEventChip (via entry.editable === false) renders them
    // with no checkbox/edit/delete — completing or editing the event only
    // ever happens from its anchor date's own chip. The 400-step cap is
    // just a safety backstop against a degenerate recurrence (e.g.
    // "custom" with no days picked, which never actually advances) —
    // ordinary patterns hit the grid's edge long before that.
    function projectOccurrences(t, pageName, pageId) {
      if (!t.recurrence || !t.dueDate) return;
      let cursor = t.dueDate;
      for (let i = 0; i < 400; i++) {
        const next = advanceDate(cursor, t.recurrence);
        if (next === cursor) return; // degenerate recurrence — nothing to advance to
        cursor = next;
        if (cursor > gridEndStr) return;
        const entry = { task: t, editable: false, virtual: true };
        if (pageName) { entry.pageName = pageName; entry.pageId = pageId; }
        (byDate[cursor] = byDate[cursor] || []).push(entry);
      }
    }
    ownTasks.filter((t) => t.dueDate && t.recurrence).forEach((t) => projectOccurrences(t, null, null));
    linkedPages.forEach((lp) => {
      state.tasks.filter((t) => t.pageId === lp.id && t.dueDate && t.recurrence).forEach((t) => projectOccurrences(t, lp.name || "Untitled", lp.id));
    });

    Object.keys(byDate).forEach((d) => {
      byDate[d].sort((a, b) => (a.task.eventTime || "99:99").localeCompare(b.task.eventTime || "99:99"));
    });

    const container = document.createElement("div");
    container.className = "calendar-view";

    const toolbar = document.createElement("div");
    toolbar.className = "calendar-toolbar";
    const nav = document.createElement("div");
    nav.className = "calendar-nav";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "calendar-nav-btn";
    prevBtn.textContent = "‹";
    prevBtn.setAttribute("aria-label", "Previous month");
    prevBtn.addEventListener("click", () => {
      let m = month - 1, y = year;
      if (m < 0) { m = 11; y -= 1; }
      setCalendarViewMonth(page.id, y, m);
      render(store.getState());
    });

    const label = document.createElement("span");
    label.className = "calendar-month-label";
    label.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "calendar-nav-btn";
    nextBtn.textContent = "›";
    nextBtn.setAttribute("aria-label", "Next month");
    nextBtn.addEventListener("click", () => {
      let m = month + 1, y = year;
      if (m > 11) { m = 0; y += 1; }
      setCalendarViewMonth(page.id, y, m);
      render(store.getState());
    });

    const todayNavBtn = document.createElement("button");
    todayNavBtn.type = "button";
    todayNavBtn.className = "secondary-btn";
    todayNavBtn.textContent = "Today";
    todayNavBtn.addEventListener("click", () => {
      const now = new Date();
      setCalendarViewMonth(page.id, now.getFullYear(), now.getMonth());
      calendarSelectedDate = todayStr();
      render(store.getState());
    });

    nav.appendChild(prevBtn);
    nav.appendChild(label);
    nav.appendChild(nextBtn);
    toolbar.appendChild(nav);
    toolbar.appendChild(todayNavBtn);
    container.appendChild(toolbar);

    const form = document.createElement("form");
    form.className = "calendar-quickadd";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = calendarSelectedDate || todayStr();
    dateInput.setAttribute("aria-label", "Event date");
    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.setAttribute("aria-label", "Event time (optional)");
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "Add an event…";
    textInput.maxLength = 200;
    textInput.autocomplete = "off";

    // "Reoccurring task" for calendar events — same recurrence vocabulary
    // as the to-do list's Repeat field (see buildTaskDetailsPanel), reused
    // here rather than reinvented: every day, every weekday, weekends
    // only, weekly, monthly, or specific custom days.
    const recurSelect = document.createElement("select");
    recurSelect.className = "calendar-quickadd-recur";
    recurSelect.setAttribute("aria-label", "Repeat");
    [
      ["none", "Doesn't repeat"],
      ["daily", "Every day"],
      ["weekdays", "Every weekday (Mon–Fri)"],
      ["weekend", "Weekends (Sat–Sun)"],
      ["weekly", "Weekly"],
      ["monthly", "Monthly"],
      ["custom", "Custom days…"]
    ].forEach(([v, lbl]) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = lbl;
      recurSelect.appendChild(opt);
    });

    const customDaysRow = document.createElement("div");
    customDaysRow.className = "calendar-quickadd-custom-days";
    customDaysRow.hidden = true;
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((dayName) => {
      const dayField = document.createElement("label");
      dayField.className = "custom-day-check";
      const dayCheck = document.createElement("input");
      dayCheck.type = "checkbox";
      dayField.appendChild(dayCheck);
      dayField.appendChild(document.createTextNode(dayName));
      customDaysRow.appendChild(dayField);
    });
    recurSelect.addEventListener("change", () => { customDaysRow.hidden = recurSelect.value !== "custom"; });

    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.textContent = "Add";
    form.appendChild(dateInput);
    form.appendChild(timeInput);
    form.appendChild(textInput);
    form.appendChild(recurSelect);
    form.appendChild(addBtn);
    form.appendChild(customDaysRow);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = textInput.value.trim();
      if (!text || !dateInput.value) return;
      const section = ownSections[0];
      if (!section) return;
      let recurrence;
      if (recurSelect.value === "custom") {
        const chosenDays = Array.from(customDaysRow.querySelectorAll('input[type="checkbox"]'))
          .map((el, i) => (el.checked ? i : -1))
          .filter((i) => i !== -1);
        recurrence = recurrenceFromValue("custom", chosenDays);
      } else {
        recurrence = recurrenceFromValue(recurSelect.value);
      }
      const task = store.addTask(section.id, text);
      store.updateTask(task.id, { dueDate: dateInput.value, eventTime: timeInput.value || null, recurrence });
      calendarSelectedDate = dateInput.value;
      textInput.value = "";
      timeInput.value = "";
      recurSelect.value = "none";
      customDaysRow.hidden = true;
      customDaysRow.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
      textInput.focus();
    });
    container.appendChild(form);

    const grid = document.createElement("div");
    grid.className = "calendar-grid";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((wd) => {
      const h = document.createElement("div");
      h.className = "calendar-weekday";
      h.textContent = wd;
      grid.appendChild(h);
    });

    // A 42-cell grid can show trailing/leading days from the previous or
    // next year (e.g. viewing January shows late-December cells) — so
    // holidays are looked up for every distinct year actually on screen,
    // not just the viewed month's year.
    const holidaysByDate = getHolidaysForYears([gridStart.getFullYear(), gridEnd.getFullYear()]);

    // Cells are a fixed size (see .calendar-day in styles.css) and never
    // grow to fit their content — so only ever append up to this many
    // chips per day; anything past that gets a "+N more" button that opens
    // the full, untruncated list in a popup instead of stretching the
    // grid. Mobile cells are shorter (and much narrower — 7 columns on a
    // phone screen), so they get a smaller cap and a shorter button label
    // ("+3" instead of "+3 more", which can wrap to two lines and poke
    // out the bottom of a ~50px-wide cell).
    const isNarrowCalendar = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;
    const maxVisibleEvents = isNarrowCalendar ? 2 : 3;

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const dateStr = fmtDate(cellDate);
      const inMonth = cellDate.getMonth() === month;

      const holidayName = holidaysByDate[dateStr];

      const cell = document.createElement("div");
      cell.className = "calendar-day"
        + (inMonth ? "" : " outside-month")
        + (dateStr === today ? " is-today" : "")
        + (dateStr === calendarSelectedDate ? " is-selected" : "")
        + (holidayName ? " has-holiday" : "");
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".calendar-event-chip") || e.target.closest(".calendar-holiday-label") || e.target.closest(".calendar-day-view")) return;
        calendarSelectedDate = dateStr;
        render(store.getState());
      });

      const num = document.createElement("span");
      num.className = "calendar-day-number";
      num.textContent = String(cellDate.getDate());
      cell.appendChild(num);

      if (holidayName) {
        const holidayLabel = document.createElement("button");
        holidayLabel.type = "button";
        holidayLabel.className = "calendar-holiday-label";
        holidayLabel.textContent = holidayName;
        holidayLabel.title = holidayName + " — click to see this day";
        holidayLabel.addEventListener("click", () => {
          calendarDayPopupDate = dateStr;
          render(store.getState());
        });
        cell.appendChild(holidayLabel);
      }

      const eventsWrap = document.createElement("div");
      eventsWrap.className = "calendar-day-events";
      const dayEntries = byDate[dateStr] || [];
      // A holiday label eats into the same fixed vertical budget as the
      // event chips, so a holiday cell gets one fewer visible slot —
      // same "adapt the content, never the cell" rule as the overflow cap.
      const cellCap = holidayName ? Math.max(1, maxVisibleEvents - 1) : maxVisibleEvents;
      const hasOverflow = dayEntries.length > cellCap;
      // When there's overflow, show one fewer chip than the cap so the
      // "+N more" button itself has guaranteed room — showing the full
      // cap AND the button was actually overflowing the fixed cell height
      // (clipped invisible by the overflow:hidden backstop, worse than
      // useless since there'd be no visible way to see the rest).
      const visibleCount = hasOverflow ? cellCap - 1 : dayEntries.length;
      dayEntries.slice(0, visibleCount).forEach((entry) => {
        eventsWrap.appendChild(buildCalendarEventChip(entry));
      });
      if (hasOverflow) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "calendar-day-more";
        const hiddenCount = dayEntries.length - visibleCount;
        more.textContent = isNarrowCalendar ? ("+" + hiddenCount) : ("+" + hiddenCount + " more");
        more.setAttribute("aria-label", "See all " + dayEntries.length + " events on " + dateStr);
        more.addEventListener("click", () => {
          calendarDayPopupDate = dateStr;
          render(store.getState());
        });
        eventsWrap.appendChild(more);
      }
      cell.appendChild(eventsWrap);

      // Overflow days already get a "+N more" button that opens the day
      // popup, but a day with just one or two events — under the cap —
      // had NO way to open it at all; the only way to see day detail was
      // via a holiday label or the overflow button, neither of which a
      // light day has. Add a small always-there "view" affordance (styled
      // to stay out of the way, not steal attention from the chips
      // themselves) whenever there's at least one event and it still fits
      // in the cell without overflowing.
      if (dayEntries.length > 0 && !hasOverflow) {
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "calendar-day-view";
        viewBtn.textContent = "\u{1F441}️";
        viewBtn.title = "View everything on this day";
        viewBtn.setAttribute("aria-label", "View all events on " + dateStr);
        viewBtn.addEventListener("click", () => {
          calendarDayPopupDate = dateStr;
          render(store.getState());
        });
        cell.appendChild(viewBtn);
      }

      grid.appendChild(cell);
    }
    container.appendChild(grid);

    sectionsEl.appendChild(container);

    renderCalendarDayPopup(byDate, holidaysByDate);
  }

  function render(state) {
    const page = activePage(state);
    if (!page) { sectionsEl.innerHTML = ""; tabsEl.innerHTML = ""; return; }
    if (page.id !== searchContextPageId) {
      searchContextPageId = page.id;
      clearSearch();
      // The day-detail popup is tied to whichever calendar page opened it
      // — leaving that page (even to another calendar) should close it
      // rather than leave it showing on top of a different page.
      calendarDayPopupDate = null;
      calendarDayOverlay.hidden = true;
    }
    activePageId = page.id;
    setStoredActivePage(page.id);

    const labels = PAGE_LABELS[page.type] || PAGE_LABELS.tasks;
    const isGrocery = page.type === "grocery";
    const isCalendar = page.type === "calendar";

    listSearchWrap.hidden = isCalendar;

    const hideDone = !isCalendar && isHideDone(page.id);
    hideDoneBtn.hidden = isCalendar;
    hideDoneBtn.classList.toggle("active", hideDone);
    hideDoneBtn.textContent = hideDone ? "\u{1F441}️ Show done" : "☑️ Hide done";
    hideDoneBtn.setAttribute("aria-pressed", String(hideDone));

    renderTabs(state, page);

    if (document.activeElement !== pageTitleInput) pageTitleInput.value = page.name || "";
    deletePageBtn.hidden = state.pages.length <= 1;
    sharePageBtn.textContent = page.sharedPageId ? "\u{1F465} Shared" : "Share list";
    sharePageBtn.classList.toggle("is-shared", !!page.sharedPageId);
    calendarLinksBtn.hidden = !isCalendar;

    newSectionInput.placeholder = labels.addSectionPlaceholder;
    addSectionBtn.textContent = labels.addSectionBtn;
    addSectionPanel.hidden = isCalendar;

    const sections = state.sections.filter((s) => s.pageId === page.id).slice().sort((a, b) => a.order - b.order);
    const tasks = state.tasks.filter((t) => t.pageId === page.id);

    collapseAllBtn.hidden = isCalendar || sections.length === 0;
    const allSectionsCollapsed = sections.length > 0 && sections.every((s) => isCollapsed(s.id));
    collapseAllBtn.classList.toggle("active", allSectionsCollapsed);
    collapseAllBtn.textContent = allSectionsCollapsed ? "⌄ Expand all" : "⌃ Collapse all";
    collapseAllBtn.setAttribute("aria-pressed", String(allSectionsCollapsed));

    sectionsEl.innerHTML = "";
    reviewBtn.hidden = isGrocery || isCalendar || !ai.isConfigured();

    if (isCalendar) {
      maybeResolveLinkedLists(page);
      renderCalendarGrid(state, page, sections, tasks);
      summaryEl.textContent = "";
      // Cross-page, so it's recomputed from the whole store on every render.
      renderTodayPanel(state);
      return;
    }

    if (sections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "panel empty-all";
      empty.textContent = labels.emptyAll;
      sectionsEl.appendChild(empty);
    }

    let totalOpen = 0, totalAll = 0, totalMatches = 0, totalHidden = 0;

    sections.forEach((s, sIdx) => {
      const sectionName = s.name || "Untitled";
      const sectionTasksAll = tasks.filter((t) => t.sectionId === s.id).slice().sort((a, b) => a.order - b.order);
      let sectionTasks = searchQuery
        ? sectionTasksAll.filter((t) => taskMatchesQuery(t.text, searchQuery))
        : sectionTasksAll;
      const hiddenDoneCount = hideDone ? sectionTasks.filter((t) => t.done).length : 0;
      totalHidden += hiddenDoneCount;
      if (hideDone) sectionTasks = sectionTasks.filter((t) => !t.done);
      // While actively searching, a section with nothing matching just
      // doesn't render at all — cleaner than an "empty" card per section
      // that has nothing to do with the search.
      if (searchQuery && sectionTasks.length === 0) return;
      totalMatches += sectionTasks.length;
      const open = sectionTasksAll.filter((t) => !t.done).length;
      totalOpen += open;
      totalAll += sectionTasksAll.length;
      // While actively searching, always show matches — a manually-collapsed
      // section shouldn't be able to hide a result. This doesn't touch the
      // stored collapse flag, so leaving the search restores it exactly.
      const collapsed = searchQuery ? false : isCollapsed(s.id);
      const sectionColor = s.color || "#3d8bff";
      const otherSections = sections.filter((o) => o.id !== s.id).map((o) => ({ id: o.id, name: o.name || "Untitled" }));

      const card = document.createElement("section");
      card.className = "section";
      card.style.borderLeftColor = sectionColor;

      const head = document.createElement("div");
      head.className = "section-head" + (collapsed ? "" : " expanded");
      head.draggable = true;
      head.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "section", sectionId: s.id }));
        card.classList.add("dragging");
      });
      head.addEventListener("dragend", () => card.classList.remove("dragging"));

      const sectionHandle = document.createElement("span");
      sectionHandle.className = "section-handle";
      sectionHandle.setAttribute("aria-hidden", "true");
      sectionHandle.textContent = "⠿";

      const sectionMoveBtns = buildMoveBtns(
        "\"" + sectionName + "\"",
        sIdx > 0,
        sIdx < sections.length - 1,
        () => {
          const ids = sections.map((x) => x.id);
          ids.splice(sIdx, 1);
          ids.splice(sIdx - 1, 0, s.id);
          store.reorderSections(ids);
        },
        () => {
          const ids = sections.map((x) => x.id);
          ids.splice(sIdx, 1);
          ids.splice(sIdx + 1, 0, s.id);
          store.reorderSections(ids);
        }
      );

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "color-swatch";
      colorInput.value = sectionColor;
      colorInput.setAttribute("aria-label", "Color for " + sectionName);
      colorInput.addEventListener("input", () => { card.style.borderLeftColor = colorInput.value; });
      colorInput.addEventListener("change", () => store.setSectionColor(s.id, colorInput.value));

      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.className = "collapse-btn" + (collapsed ? " is-collapsed" : "");
      collapseBtn.textContent = "▾";
      collapseBtn.setAttribute("aria-expanded", String(!collapsed));
      collapseBtn.setAttribute("aria-label", (collapsed ? "Expand" : "Collapse") + " " + sectionName);

      const name = document.createElement("input");
      name.type = "text";
      name.className = "section-name";
      name.value = sectionName;
      name.maxLength = 80;
      name.setAttribute("aria-label", labels.nounCap + " name");
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); name.blur(); }
        else if (e.key === "Escape") { name.value = sectionName; name.blur(); }
      });
      name.addEventListener("blur", () => {
        const val = name.value.trim();
        if (!val) { name.value = sectionName; return; }
        if (val === sectionName) return;
        store.renameSection(s.id, val);
      });

      const count = document.createElement("span");
      count.className = "section-count";
      count.textContent = sectionTasksAll.length === 0 ? "empty" : (open + "/" + sectionTasksAll.length);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "section-del";
      delBtn.textContent = "Delete";
      wireDeleteSection(delBtn, s.id, sectionTasksAll.length, labels);

      head.appendChild(sectionHandle);
      head.appendChild(sectionMoveBtns);
      head.appendChild(collapseBtn);
      head.appendChild(colorInput);
      head.appendChild(name);
      head.appendChild(count);
      head.appendChild(delBtn);
      card.appendChild(head);

      let healthEl = null;
      if (!isGrocery) {
        const health = sectionHealth(sectionTasksAll);
        if (health) {
          healthEl = document.createElement("div");
          healthEl.className = "health-strip";
          healthEl.hidden = collapsed;
          healthEl.appendChild(document.createTextNode("Active " + health.active + " · Done this wk " + health.doneWeek));
          const openValueText = formatMoney(health.openValue);
          if (openValueText) {
            healthEl.appendChild(document.createTextNode(" · " + openValueText + " open"));
          }
          if (health.stalled > 0) {
            healthEl.appendChild(document.createTextNode(" · "));
            const stalledSpan = document.createElement("span");
            stalledSpan.className = "stalled-flag";
            stalledSpan.textContent = health.stalled + " stalled";
            healthEl.appendChild(stalledSpan);
          }
          card.appendChild(healthEl);
        }
      }

      const form = document.createElement("form");
      form.className = "add-task";
      form.hidden = collapsed;
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = labels.addTaskPlaceholder(sectionName);
      input.maxLength = 200;
      input.autocomplete = "off";
      const btn = document.createElement("button");
      btn.type = "submit";
      btn.textContent = "Add";
      form.appendChild(input);
      form.appendChild(btn);
      wireAddTask(form, input, btn, s.id);
      card.appendChild(form);

      const list = document.createElement("ul");
      list.className = "list";
      list.hidden = collapsed;

      if (sectionTasks.length === 0) {
        const et = document.createElement("li");
        et.className = "empty-tasks";
        et.textContent = hiddenDoneCount > 0
          ? "Nothing left — " + hiddenDoneCount + " checked-off item" + (hiddenDoneCount === 1 ? "" : "s") + " hidden."
          : labels.emptyTasks;
        list.appendChild(et);
      } else if (isGrocery) {
        sectionTasks.forEach((t, i) => {
          list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections, true, sectionTasks, i));
        });
      } else {
        const activeTasks = sectionTasks.filter((t) => !t.isSomeday);
        const somedayTasks = sectionTasks.filter((t) => t.isSomeday);
        activeTasks.forEach((t, i) => {
          list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections, false, activeTasks, i));
        });
        if (somedayTasks.length) {
          const divider = document.createElement("li");
          divider.className = "someday-divider";
          divider.textContent = "Someday";
          list.appendChild(divider);
          somedayTasks.forEach((t, i) => {
            list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections, false, somedayTasks, i));
          });
        }
      }
      card.appendChild(list);

      collapseBtn.addEventListener("click", () => {
        const next = !isCollapsed(s.id);
        setCollapsed(s.id, next);
        collapseBtn.classList.toggle("is-collapsed", next);
        collapseBtn.setAttribute("aria-expanded", String(!next));
        collapseBtn.setAttribute("aria-label", (next ? "Expand" : "Collapse") + " " + sectionName);
        head.classList.toggle("expanded", !next);
        form.hidden = next;
        list.hidden = next;
        if (healthEl) healthEl.hidden = next;
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", (e) => {
        if (!card.contains(e.relatedTarget)) card.classList.remove("drag-over");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        const raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;
        let payload;
        try { payload = JSON.parse(raw); } catch (err) { return; }
        if (!payload) return;
        if (payload.kind === "task") {
          // Dropped on the card itself (not on a specific row) — append to
          // the end of this section. Row-level drops (handled in
          // buildTaskRow) take care of precise reordering.
          if (!payload.taskId) return;
          store.reorderTaskInSection(payload.taskId, s.id, null);
        } else if (payload.kind === "section") {
          if (!payload.sectionId || payload.sectionId === s.id) return;
          const rect = card.getBoundingClientRect();
          const before = e.clientY < rect.top + rect.height / 2;
          const ids = sections.map((x) => x.id);
          const fromIdx = ids.indexOf(payload.sectionId);
          if (fromIdx === -1) return;
          ids.splice(fromIdx, 1);
          let toIdx = ids.indexOf(s.id);
          if (toIdx === -1) return;
          if (!before) toIdx += 1;
          ids.splice(toIdx, 0, payload.sectionId);
          store.reorderSections(ids);
        }
      });

      sectionsEl.appendChild(card);
    });

    if (searchQuery && totalMatches === 0 && sections.length > 0) {
      const noMatch = document.createElement("div");
      noMatch.className = "panel empty-all";
      noMatch.textContent = "No matches for “" + searchQuery + "” — press Enter in the search box above to add it as a new item.";
      sectionsEl.appendChild(noMatch);
    }

    const hiddenSuffix = hideDone && totalHidden > 0 ? " (" + totalHidden + " hidden)" : "";
    summaryEl.textContent = sections.length === 0
      ? ""
      : searchQuery
        ? totalMatches + " match" + (totalMatches === 1 ? "" : "es") + " for “" + searchQuery + "”" + hiddenSuffix
        : isGrocery
          ? totalOpen + " of " + totalAll + " left to get across " + sections.length + " categor" + (sections.length === 1 ? "y" : "ies") + hiddenSuffix
          : totalOpen + " of " + totalAll + " open across " + sections.length + " section" + (sections.length === 1 ? "" : "s") + hiddenSuffix;

    // Cross-page, so it's recomputed from the whole store on every render —
    // not scoped to whichever page/section loop just ran above.
    renderTodayPanel(state);
  }

  store.subscribe(render);

  // --- list search: live filter as you type, smart Enter to add/check/uncheck ---
  listSearchInput.addEventListener("input", () => {
    searchQuery = listSearchInput.value.trim();
    listSearchClear.hidden = !searchQuery;
    render(store.getState());
  });
  listSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearSearch();
      render(store.getState());
      listSearchInput.blur();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();

    const state = store.getState();
    const page = activePage(state);
    if (!page) return;
    const labels = PAGE_LABELS[page.type] || PAGE_LABELS.tasks;
    const query = listSearchInput.value.trim();
    if (!query) return;

    const sections = state.sections.filter((s) => s.pageId === page.id);
    const tasks = state.tasks.filter((t) => t.pageId === page.id);
    const m = findBestMatch(tasks, query, "text");

    if (m) {
      // Same item either way: Enter on something unchecked checks it off,
      // Enter on something already checked off unchecks it — no separate
      // "did you mean check or uncheck" step, it just does the one thing
      // that makes sense for whatever state the item is currently in.
      const wasDone = !!m.item.done;
      pendingCelebrationId = (page.type !== "grocery" && !wasDone) ? m.item.id : null;
      store.toggleTaskDone(m.item.id);
      setStatus((wasDone ? "Unchecked “" : "Checked off “") + m.item.text + "”.");
      clearSearch();
      render(store.getState());
      return;
    }
    if (sections.length === 0) {
      setStatus("Add a " + labels.noun + " first, then try again.", true);
      return;
    }

    if (page.type === "grocery") {
      // Auto-categorize: guess the right category instead of just
      // dropping every new item into the first one. The category-select
      // on the row is still there afterward if the guess needs fixing.
      resolveGroceryCategory(sections, query).then(({ section, matched, viaAI }) => {
        store.addTask(section.id, query);
        const how = matched ? (viaAI ? " (AI-categorized)" : "") : "";
        setStatus("Added “" + query + "” to " + (section.name || "Untitled") + how + ".");
        clearSearch();
        render(store.getState());
      });
    } else {
      // No section to aim at from a plain search box the way a voice
      // command can say "to produce" — new items land in the first
      // section, easy to drag/move afterward.
      const targetSection = sections[0];
      store.addTask(targetSection.id, query);
      setStatus("Added “" + query + "” to " + (targetSection.name || "Untitled") + ".");
      clearSearch();
      render(store.getState());
    }
  });
  listSearchClear.addEventListener("click", () => {
    clearSearch();
    render(store.getState());
    listSearchInput.focus();
  });

  // --- page title / tabs / add-page / delete-page wiring ---
  pageTitleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); pageTitleInput.blur(); }
    else if (e.key === "Escape") { pageTitleInput.value = activePage(store.getState()).name || ""; pageTitleInput.blur(); }
  });
  pageTitleInput.addEventListener("blur", () => {
    const page = activePage(store.getState());
    if (!page) return;
    const val = pageTitleInput.value.trim();
    if (!val) { pageTitleInput.value = page.name || ""; return; }
    if (val === page.name) return;
    store.renamePage(page.id, val);
  });

  addPageConfirm.addEventListener("click", () => {
    const name = newPageName.value.trim();
    if (!name) { newPageName.focus(); return; }
    const page = store.addPage(name, newPageType.value);
    activePageId = page.id;
    setStoredActivePage(page.id);
    addPageForm.hidden = true;
    newPageName.value = "";
    render(store.getState());
  });
  newPageName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addPageConfirm.click(); }
    else if (e.key === "Escape") { addPageForm.hidden = true; }
  });
  addPageCancel.addEventListener("click", () => { addPageForm.hidden = true; });

  let deleteConfirming = false;
  let deleteRevertTimer = null;
  deletePageBtn.addEventListener("click", async () => {
    const page = activePage(store.getState());
    if (!page) return;
    if (!deleteConfirming) {
      deleteConfirming = true;
      deletePageBtn.classList.add("confirm");
      deletePageBtn.textContent = page.sharedPageId ? "Delete this page? (also leaves the shared list)" : "Delete this page?";
      deleteRevertTimer = setTimeout(() => {
        deleteConfirming = false;
        deletePageBtn.classList.remove("confirm");
        deletePageBtn.textContent = "Delete page";
      }, 4000);
      return;
    }
    clearTimeout(deleteRevertTimer);
    deleteConfirming = false;
    deletePageBtn.classList.remove("confirm");
    deletePageBtn.textContent = "Delete page";
    // Deleting a shared page locally shouldn't leave it orphaned on the
    // server — stop sharing it (owner) or leave it (editor) first, same
    // as the Share modal's buttons would. leaveSharedList already removes
    // the local page itself (nothing useful to keep once you're off a
    // list you don't own), so there's nothing left for us to delete in
    // that case; stopSharingList only unshares it, leaving the normal
    // delete below to actually remove it, same as any personal page.
    if (page.sharedPageId) {
      try {
        if (page.shareRole === "owner") {
          await sync.stopSharingList(page.id);
        } else {
          await sync.leaveSharedList(page.id);
          activePageId = null;
          setStoredActivePage("");
          render(store.getState());
          return;
        }
      } catch (e) { /* best-effort — fall through to the normal local delete below */ }
    }
    const ok = store.deletePage(page.id);
    if (ok) {
      activePageId = null; // fall back to the first remaining page
      setStoredActivePage("");
      render(store.getState());
    }
  });

  // --- share modal: turn the active page into a shared list, or manage
  // one it's already on. Sharing/joining itself lives in sync.js — this
  // is just the modal's state rendering and button wiring. ---
  function renderShareModal(status, page, info) {
    shareNotConfigured.hidden = true;
    shareSignedOut.hidden = true;
    shareUnshared.hidden = true;
    shareShared.hidden = true;
    shareStatus.textContent = "";
    shareStatus.className = "settings-status";

    if (!status.configured) { shareNotConfigured.hidden = false; return; }
    if (!status.loggedIn) { shareSignedOut.hidden = false; return; }

    if (!page.sharedPageId) {
      shareUnshared.hidden = false;
      shareUnsharedHelp.textContent = "Turn “" + (page.name || "this list") + "” into a shared list — anyone with the invite code can join it, and you'll both see each other's changes live.";
      return;
    }

    shareShared.hidden = false;
    const isOwner = page.shareRole === "owner";
    shareSharedHelp.textContent = isOwner
      ? "This list is shared. Anyone with the code below can join it."
      : "You're on this shared list.";
    shareInviteCode.hidden = !(info && info.inviteCode);
    shareInviteCode.textContent = info && info.inviteCode ? info.inviteCode : "";
    shareMemberCount.textContent = info && typeof info.memberCount === "number"
      ? info.memberCount + (info.memberCount === 1 ? " person has" : " people have") + " this list"
      : "";
    shareStopBtn.hidden = !isOwner;
    shareLeaveBtn.hidden = isOwner;
  }

  async function openShareModal() {
    const page = activePage(store.getState());
    if (!page) return;
    sharePageName.textContent = page.name || "Untitled";
    const status = sync.getStatus();
    renderShareModal(status, page, null);
    shareOverlay.hidden = false;
    if (status.configured && status.loggedIn && page.sharedPageId) {
      try {
        const info = await sync.getSharedListInfo(page.id);
        // The modal could have been closed, or the page's share state
        // could have changed, while this was in flight — recheck before
        // applying a result that's now stale.
        const freshPage = store.getState().pages.find((p) => p.id === page.id);
        if (!shareOverlay.hidden && freshPage && freshPage.sharedPageId) {
          renderShareModal(sync.getStatus(), freshPage, info);
        }
      } catch (e) { /* non-fatal — the modal still works without member info */ }
    }
  }

  function closeShareModal() { shareOverlay.hidden = true; }

  sharePageBtn.addEventListener("click", openShareModal);
  shareClose.addEventListener("click", closeShareModal);
  shareDoneBtn.addEventListener("click", closeShareModal);
  shareOverlay.addEventListener("click", (e) => { if (e.target === shareOverlay) closeShareModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !shareOverlay.hidden) closeShareModal();
    if (e.key === "Escape" && !calendarLinksOverlay.hidden) closeCalendarLinksModal();
    if (e.key === "Escape" && !calendarDayOverlay.hidden) closeCalendarDayPopup();
  });

  function closeCalendarDayPopup() {
    calendarDayPopupDate = null;
    calendarDayOverlay.hidden = true;
  }
  calendarDayClose.addEventListener("click", closeCalendarDayPopup);
  calendarDayDoneBtn.addEventListener("click", closeCalendarDayPopup);
  calendarDayOverlay.addEventListener("click", (e) => { if (e.target === calendarDayOverlay) closeCalendarDayPopup(); });

  shareGenerateBtn.addEventListener("click", async () => {
    const page = activePage(store.getState());
    if (!page) return;
    shareGenerateBtn.disabled = true;
    shareStatus.textContent = "Setting up…";
    shareStatus.className = "settings-status";
    try {
      await sync.createSharedList(page.id);
      const freshPage = store.getState().pages.find((p) => p.id === page.id);
      const info = await sync.getSharedListInfo(page.id);
      renderShareModal(sync.getStatus(), freshPage, info);
    } catch (e) {
      shareStatus.textContent = (e && e.message) || "Couldn't share this list.";
      shareStatus.className = "settings-status err";
    } finally {
      shareGenerateBtn.disabled = false;
    }
  });

  shareCopyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareInviteCode.textContent || "");
      shareStatus.textContent = "Copied.";
      shareStatus.className = "settings-status ok";
    } catch (e) {
      shareStatus.textContent = "Couldn't copy automatically — select and copy the code above by hand.";
      shareStatus.className = "settings-status err";
    }
  });

  shareStopBtn.addEventListener("click", async () => {
    const page = activePage(store.getState());
    if (!page) return;
    shareStopBtn.disabled = true;
    try {
      await sync.stopSharingList(page.id);
      const freshPage = store.getState().pages.find((p) => p.id === page.id);
      renderShareModal(sync.getStatus(), freshPage, null);
    } catch (e) {
      shareStatus.textContent = (e && e.message) || "Couldn't stop sharing.";
      shareStatus.className = "settings-status err";
    } finally {
      shareStopBtn.disabled = false;
    }
  });

  shareLeaveBtn.addEventListener("click", async () => {
    const page = activePage(store.getState());
    if (!page) return;
    shareLeaveBtn.disabled = true;
    try {
      await sync.leaveSharedList(page.id);
      closeShareModal();
      render(store.getState());
    } catch (e) {
      shareStatus.textContent = (e && e.message) || "Couldn't leave this list.";
      shareStatus.className = "settings-status err";
      shareLeaveBtn.disabled = false;
    }
  });

  // --- calendar links modal: which to-do/grocery lists feed the active
  // calendar's grid, and linking a new one (with the "share it with this
  // calendar's existing members too?" prompt when there's anyone to
  // share it with). ---

  function renderCalendarLinksModal() {
    const page = activePage(store.getState());
    if (!page) return;
    const state = store.getState();
    const linkedIds = Array.isArray(page.linkedListIds) ? page.linkedListIds : [];
    calendarLinksPageName.textContent = page.name || "Untitled";

    calendarLinkedListRows.innerHTML = "";
    const linkedPages = linkedIds.map((id) => state.pages.find((p) => p.id === id)).filter(Boolean);
    calendarNoLinks.hidden = linkedPages.length > 0;
    linkedPages.forEach((lp) => {
      const row = document.createElement("div");
      row.className = "today-row";
      const name = document.createElement("span");
      name.className = "today-row-text";
      name.textContent = lp.name || "Untitled";
      row.appendChild(name);
      const unlinkBtn = document.createElement("button");
      unlinkBtn.type = "button";
      unlinkBtn.className = "section-del";
      unlinkBtn.textContent = "Unlink";
      unlinkBtn.addEventListener("click", async () => {
        unlinkBtn.disabled = true;
        try {
          await sync.unlinkListFromCalendar(page.id, lp.id);
          renderCalendarLinksModal();
        } catch (e) {
          calendarLinksStatus.textContent = (e && e.message) || "Couldn't unlink that list.";
          calendarLinksStatus.className = "settings-status err";
          unlinkBtn.disabled = false;
        }
      });
      row.appendChild(unlinkBtn);
      calendarLinkedListRows.appendChild(row);
    });

    calendarLinkSelect.innerHTML = "";
    const linkable = state.pages.filter((p) => p.id !== page.id && p.type !== "calendar" && !linkedIds.includes(p.id));
    linkable.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "Untitled";
      calendarLinkSelect.appendChild(opt);
    });
    calendarLinkAddEmpty.hidden = linkable.length > 0;
    calendarLinkSelect.hidden = linkable.length === 0;
    calendarLinkAddBtn.hidden = linkable.length === 0;

    calendarSharePrompt.hidden = true;
    pendingLinkListId = null;
  }

  async function finishLinkWithShare(shareWithMembers) {
    const page = activePage(store.getState());
    if (!page || !pendingLinkListId) return;
    calendarShareYesBtn.disabled = true;
    calendarShareNoBtn.disabled = true;
    try {
      await sync.linkListToCalendar(page.id, pendingLinkListId, shareWithMembers);
      renderCalendarLinksModal();
    } catch (e) {
      calendarLinksStatus.textContent = (e && e.message) || "Couldn't link that list.";
      calendarLinksStatus.className = "settings-status err";
    } finally {
      calendarShareYesBtn.disabled = false;
      calendarShareNoBtn.disabled = false;
    }
  }

  function openCalendarLinksModal() {
    const page = activePage(store.getState());
    if (!page) return;
    calendarLinksStatus.textContent = "";
    calendarLinksStatus.className = "settings-status";
    renderCalendarLinksModal();
    calendarLinksOverlay.hidden = false;
  }

  function closeCalendarLinksModal() {
    calendarLinksOverlay.hidden = true;
    pendingLinkListId = null;
  }

  calendarLinksBtn.addEventListener("click", openCalendarLinksModal);
  calendarLinksClose.addEventListener("click", closeCalendarLinksModal);
  calendarLinksDoneBtn.addEventListener("click", closeCalendarLinksModal);
  calendarLinksOverlay.addEventListener("click", (e) => { if (e.target === calendarLinksOverlay) closeCalendarLinksModal(); });

  calendarLinkAddBtn.addEventListener("click", async () => {
    const page = activePage(store.getState());
    if (!page) return;
    const listId = calendarLinkSelect.value;
    if (!listId) return;
    calendarLinkAddBtn.disabled = true;
    calendarLinksStatus.textContent = "";
    calendarLinksStatus.className = "settings-status";
    try {
      const others = await sync.getCalendarOtherMembers(page.id);
      if (others.length > 0) {
        const listPage = store.getState().pages.find((p) => p.id === listId);
        pendingLinkListId = listId;
        calendarSharePromptText.textContent = "This calendar is shared with "
          + others.map((m) => m.email).join(", ")
          + ". Share “" + (listPage ? (listPage.name || "this list") : "this list") + "” with them too?";
        calendarSharePrompt.hidden = false;
      } else {
        await sync.linkListToCalendar(page.id, listId, false);
        renderCalendarLinksModal();
      }
    } catch (e) {
      calendarLinksStatus.textContent = (e && e.message) || "Couldn't link that list.";
      calendarLinksStatus.className = "settings-status err";
    } finally {
      calendarLinkAddBtn.disabled = false;
    }
  });

  calendarShareYesBtn.addEventListener("click", () => finishLinkWithShare(true));
  calendarShareNoBtn.addEventListener("click", () => finishLinkWithShare(false));

  addSectionBtn.addEventListener("click", () => {
    const name = newSectionInput.value.trim();
    if (!name) return;
    const page = activePage(store.getState());
    if (!page) return;
    store.addSection(page.id, name);
    newSectionInput.value = "";
    newSectionInput.focus();
  });
  newSectionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addSectionBtn.click(); }
  });

  voiceBtn.addEventListener("click", startVoiceCommand);

  hideDoneBtn.addEventListener("click", () => {
    const page = activePage(store.getState());
    if (!page) return;
    setHideDone(page.id, !isHideDone(page.id));
    render(store.getState());
  });

  collapseAllBtn.addEventListener("click", () => {
    const state = store.getState();
    const page = activePage(state);
    if (!page) return;
    const pageSections = state.sections.filter((s) => s.pageId === page.id);
    if (pageSections.length === 0) return;
    const allCollapsed = pageSections.every((s) => isCollapsed(s.id));
    const target = !allCollapsed;
    pageSections.forEach((s) => setCollapsed(s.id, target));
    render(store.getState());
  });

  todayBtn.addEventListener("click", () => {
    todayPanel.hidden = !todayPanel.hidden;
    if (!todayPanel.hidden) renderTodayPanel(store.getState());
  });
  todayCloseBtn.addEventListener("click", () => { todayPanel.hidden = true; });

  reviewBtn.addEventListener("click", runWeeklyReview);
  reviewStopBtn.addEventListener("click", () => { if (reviewCtl) reviewCtl.abort(); });
  reviewCloseBtn.addEventListener("click", () => {
    reviewPanel.hidden = true;
    if (reviewCtl) reviewCtl.abort();
  });

  return { refresh: () => render(store.getState()) };
}
