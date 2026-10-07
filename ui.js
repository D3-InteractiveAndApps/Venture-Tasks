// ui.js — renders the active page's tabs, sections and tasks from the
// store, and wires every interaction (tabs, drag/drop reordering, collapse,
// rename, color, due dates, recurrence, someday, the AI co-pilot, the
// weekly review, and the completion celebration).

import {
  STALE_DAYS, daysUntil, daysSince, activityText,
  dueBadgeInfo, recurrenceValue, recurrenceFromValue
} from "./dates.js";

const LS_COLLAPSED_PREFIX = "ventureTasks:collapsed:";
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
function getStoredActivePage() {
  try { return window.localStorage.getItem(LS_ACTIVE_PAGE); } catch (e) { return null; }
}
function setStoredActivePage(id) {
  try { window.localStorage.setItem(LS_ACTIVE_PAGE, id); } catch (e) { /* non-fatal */ }
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
  const statusEl = document.getElementById("status");
  const newSectionInput = document.getElementById("new-section");
  const addSectionBtn = document.getElementById("add-section-btn");
  const reviewBtn = document.getElementById("review-btn");
  const reviewPanel = document.getElementById("review-panel");
  const reviewBody = document.getElementById("review-body");
  const reviewStopBtn = document.getElementById("review-stop");
  const reviewCloseBtn = document.getElementById("review-close");
  const settingsBtn = document.getElementById("settings-btn");

  const openDetailsIds = {};
  let reviewCtl = null;
  let activePageId = getStoredActivePage();
  // Set right before a toggle that should celebrate, and consumed inside the
  // very next render pass (store.toggleTaskDone triggers that render
  // synchronously, rebuilding the DOM — so the celebration has to be applied
  // to the freshly-built row, not the one the click happened on, which is
  // gone by the time control returns here).
  let pendingCelebrationId = null;

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

  function buildTaskRow(task, sectionId, sectionName, otherSections, isGrocery, beforeTaskIdForDrop) {
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
        recurBadge.title = "Repeats";
        recurBadge.setAttribute("aria-label", "Repeating task");
        recurBadge.textContent = "↻";
        row.appendChild(recurBadge);
      }
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
    const recurSelect = document.createElement("select");
    ["none", "daily", "weekly", "monthly"].forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v === "none" ? "Doesn't repeat" : v[0].toUpperCase() + v.slice(1);
      recurSelect.appendChild(opt);
    });
    recurSelect.value = recurrenceValue(task.recurrence);
    recurSelect.addEventListener("change", () => store.updateTask(task.id, { recurrence: recurrenceFromValue(recurSelect.value) }));
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

    controls.appendChild(dueField);
    controls.appendChild(recurField);
    controls.appendChild(somedayField);

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
    return { active: activityText(daysSince(lastTs)), doneWeek, stalled };
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
      tab.textContent = p.name || "Untitled";
      tab.title = p.name || "Untitled";
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

  function render(state) {
    const page = activePage(state);
    if (!page) { sectionsEl.innerHTML = ""; tabsEl.innerHTML = ""; return; }
    activePageId = page.id;
    setStoredActivePage(page.id);

    const labels = PAGE_LABELS[page.type] || PAGE_LABELS.tasks;
    const isGrocery = page.type === "grocery";

    renderTabs(state, page);

    if (document.activeElement !== pageTitleInput) pageTitleInput.value = page.name || "";
    deletePageBtn.hidden = state.pages.length <= 1;

    newSectionInput.placeholder = labels.addSectionPlaceholder;
    addSectionBtn.textContent = labels.addSectionBtn;

    const sections = state.sections.filter((s) => s.pageId === page.id).slice().sort((a, b) => a.order - b.order);
    const tasks = state.tasks.filter((t) => t.pageId === page.id);

    sectionsEl.innerHTML = "";
    reviewBtn.hidden = isGrocery || !ai.isConfigured();

    if (sections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "panel empty-all";
      empty.textContent = labels.emptyAll;
      sectionsEl.appendChild(empty);
    }

    let totalOpen = 0, totalAll = 0;

    sections.forEach((s) => {
      const sectionName = s.name || "Untitled";
      const sectionTasks = tasks.filter((t) => t.sectionId === s.id).slice().sort((a, b) => a.order - b.order);
      const open = sectionTasks.filter((t) => !t.done).length;
      totalOpen += open;
      totalAll += sectionTasks.length;
      const collapsed = isCollapsed(s.id);
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
      count.textContent = sectionTasks.length === 0 ? "empty" : (open + "/" + sectionTasks.length);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "section-del";
      delBtn.textContent = "Delete";
      wireDeleteSection(delBtn, s.id, sectionTasks.length, labels);

      head.appendChild(sectionHandle);
      head.appendChild(collapseBtn);
      head.appendChild(colorInput);
      head.appendChild(name);
      head.appendChild(count);
      head.appendChild(delBtn);
      card.appendChild(head);

      let healthEl = null;
      if (!isGrocery) {
        const health = sectionHealth(sectionTasks);
        if (health) {
          healthEl = document.createElement("div");
          healthEl.className = "health-strip";
          healthEl.hidden = collapsed;
          healthEl.appendChild(document.createTextNode("Active " + health.active + " · Done this wk " + health.doneWeek));
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
        et.textContent = labels.emptyTasks;
        list.appendChild(et);
      } else if (isGrocery) {
        sectionTasks.forEach((t, i) => {
          const beforeId = sectionTasks[i + 1] ? sectionTasks[i + 1].id : null;
          list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections, true, beforeId));
        });
      } else {
        const activeTasks = sectionTasks.filter((t) => !t.isSomeday);
        const somedayTasks = sectionTasks.filter((t) => t.isSomeday);
        activeTasks.forEach((t, i) => {
          const beforeId = activeTasks[i + 1] ? activeTasks[i + 1].id : (somedayTasks[0] ? somedayTasks[0].id : null);
          list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections, false, beforeId));
        });
        if (somedayTasks.length) {
          const divider = document.createElement("li");
          divider.className = "someday-divider";
          divider.textContent = "Someday";
          list.appendChild(divider);
          somedayTasks.forEach((t, i) => {
            const beforeId = somedayTasks[i + 1] ? somedayTasks[i + 1].id : null;
            list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections, false, beforeId));
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

    summaryEl.textContent = sections.length === 0
      ? ""
      : isGrocery
        ? totalOpen + " of " + totalAll + " left to get across " + sections.length + " categor" + (sections.length === 1 ? "y" : "ies")
        : totalOpen + " of " + totalAll + " open across " + sections.length + " section" + (sections.length === 1 ? "" : "s");
  }

  store.subscribe(render);

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
  deletePageBtn.addEventListener("click", () => {
    const page = activePage(store.getState());
    if (!page) return;
    if (!deleteConfirming) {
      deleteConfirming = true;
      deletePageBtn.classList.add("confirm");
      deletePageBtn.textContent = "Delete this page?";
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
    const ok = store.deletePage(page.id);
    if (ok) {
      activePageId = null; // fall back to the first remaining page
      setStoredActivePage("");
      render(store.getState());
    }
  });

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

  reviewBtn.addEventListener("click", runWeeklyReview);
  reviewStopBtn.addEventListener("click", () => { if (reviewCtl) reviewCtl.abort(); });
  reviewCloseBtn.addEventListener("click", () => {
    reviewPanel.hidden = true;
    if (reviewCtl) reviewCtl.abort();
  });

  return { refresh: () => render(store.getState()) };
}
