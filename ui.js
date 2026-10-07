// ui.js — renders sections and tasks from the store, and wires every
// interaction (drag/drop, collapse, rename, color, due dates, recurrence,
// someday, the AI co-pilot and the weekly review).

import {
  STALE_DAYS, daysUntil, daysSince, activityText, advanceDate,
  dueBadgeInfo, recurrenceValue, recurrenceFromValue
} from "./dates.js";

const LS_COLLAPSED_PREFIX = "ventureTasks:collapsed:";
const TASK_COLOR_DEFAULT = "#9a9da3";

function isCollapsed(id) {
  try { return window.localStorage.getItem(LS_COLLAPSED_PREFIX + id) === "1"; } catch (e) { return false; }
}
function setCollapsed(id, val) {
  try {
    if (val) window.localStorage.setItem(LS_COLLAPSED_PREFIX + id, "1");
    else window.localStorage.removeItem(LS_COLLAPSED_PREFIX + id);
  } catch (e) { /* per-browser convenience only */ }
}

export function initUI(store, ai) {
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
    const { sections, tasks } = store.getState();

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

    const prompt = "You're a concise productivity assistant. Here is the current state of someone's multi-business to-do list, one line per business:\n\n"
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

  function buildTaskRow(task, sectionId, sectionName, otherSections) {
    const wrap = document.createElement("li");
    wrap.className = "row-wrap" + (task.done ? " done" : "") + (task.isSomeday ? " someday" : "");
    wrap.draggable = true;
    wrap.style.borderLeftColor = task.color || "transparent";

    wrap.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "task", taskId: task.id, from: sectionId }));
      wrap.classList.add("dragging");
    });
    wrap.addEventListener("dragend", () => wrap.classList.remove("dragging"));

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
      wrap.classList.toggle("done", next);
      store.updateTask(task.id, { done: next, completedAt: next ? new Date().toISOString() : null });
      if (next && task.recurrence) {
        store.addTaskFull({
          text: task.text,
          done: false,
          sectionId: sectionId,
          order: Date.now(),
          color: task.color || null,
          dueDate: advanceDate(task.dueDate, task.recurrence),
          recurrence: task.recurrence,
          isSomeday: !!task.isSomeday,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null
        });
      }
    });

    const label = document.createElement("label");
    label.className = "row-text";
    label.setAttribute("for", check.id);
    label.textContent = task.text || "";

    row.appendChild(handle);
    row.appendChild(check);
    row.appendChild(colorInput);
    row.appendChild(label);

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

    const detailsToggle = document.createElement("button");
    detailsToggle.type = "button";
    detailsToggle.className = "details-toggle";
    detailsToggle.textContent = "⋯";
    detailsToggle.setAttribute("aria-label", "Details for \"" + task.text + "\"");

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-btn";
    del.setAttribute("aria-label", "Delete \"" + task.text + "\"");
    del.textContent = "×";
    del.addEventListener("click", () => store.deleteTask(task.id));

    row.appendChild(detailsToggle);
    row.appendChild(del);
    wrap.appendChild(row);

    // --- details panel ---
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

    return wrap;
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

  function wireDeleteSection(btn, sectionId, sectionTaskCount) {
    let confirming = false;
    let revertTimer = null;
    btn.addEventListener("click", () => {
      if (!confirming) {
        confirming = true;
        btn.classList.add("confirm");
        btn.textContent = sectionTaskCount
          ? "Delete section + " + sectionTaskCount + " task" + (sectionTaskCount === 1 ? "" : "s") + "?"
          : "Delete section?";
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

  function render(state) {
    const sections = state.sections.slice().sort((a, b) => a.order - b.order);
    const tasks = state.tasks;

    sectionsEl.innerHTML = "";
    reviewBtn.hidden = !ai.isConfigured();

    if (sections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "panel empty-all";
      empty.textContent = "No sections yet. Add your first business or project below.";
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
      name.setAttribute("aria-label", "Section name");
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
      wireDeleteSection(delBtn, s.id, sectionTasks.length);

      head.appendChild(sectionHandle);
      head.appendChild(collapseBtn);
      head.appendChild(colorInput);
      head.appendChild(name);
      head.appendChild(count);
      head.appendChild(delBtn);
      card.appendChild(head);

      const health = sectionHealth(sectionTasks);
      let healthEl = null;
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

      const form = document.createElement("form");
      form.className = "add-task";
      form.hidden = collapsed;
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Add a task to " + sectionName + "…";
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
        et.textContent = "No tasks yet in this section.";
        list.appendChild(et);
      } else {
        const activeTasks = sectionTasks.filter((t) => !t.isSomeday);
        const somedayTasks = sectionTasks.filter((t) => t.isSomeday);
        activeTasks.forEach((t) => list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections)));
        if (somedayTasks.length) {
          const divider = document.createElement("li");
          divider.className = "someday-divider";
          divider.textContent = "Someday";
          list.appendChild(divider);
          somedayTasks.forEach((t) => list.appendChild(buildTaskRow(t, s.id, sectionName, otherSections)));
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
          if (!payload.taskId || payload.from === s.id) return;
          store.moveTask(payload.taskId, s.id);
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
      : totalOpen + " of " + totalAll + " open across " + sections.length + " section" + (sections.length === 1 ? "" : "s");
  }

  store.subscribe(render);

  addSectionBtn.addEventListener("click", () => {
    const name = newSectionInput.value.trim();
    if (!name) return;
    store.addSection(name);
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
