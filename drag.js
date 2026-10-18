// drag.js — reordering by dragging a handle, with one mechanism for mouse,
// touch, and pen (Pointer Events). Replaces both the old desktop-only
// HTML5 drag-and-drop and the stacked up/down arrow buttons phones used to
// get instead (which doubled every row's height).
//
// While dragging, the item floats under your finger and a same-sized
// placeholder shows where it'll land; dropping into a different zone (e.g.
// another section's list) is allowed. Dragging near the top or bottom of
// the screen scrolls the page. The handle is a real button, so keyboard
// users get ArrowUp / ArrowDown instead.
//
//   makeReorderable(handle, {
//     item,            // the element that moves (e.g. the <li>)
//     root,            // element containing every drop zone
//     zoneSelector,    // drop zones inside root (each needs data-zone-id)
//     itemSelector,    // reorderable siblings inside a zone
//     onDrop({ zoneId, beforeId }),   // beforeId = data-id of the next item, or null for "at the end"
//     onKey(direction)                // -1 / +1 from the arrow keys
//   })

const EDGE = 70;        // px from the viewport edge where auto-scroll kicks in
const MAX_SCROLL = 16;  // px per frame at the very edge

export function makeReorderable(handle, opts) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    startDrag(e, handle, opts);
  });
  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (opts.onKey) opts.onKey(e.key === "ArrowUp" ? -1 : 1);
    }
  });
}

function nextItem(el, itemSelector, skip) {
  let n = el.nextElementSibling;
  while (n && (n === skip || !n.matches(itemSelector))) n = n.nextElementSibling;
  return n;
}

function startDrag(e, handle, opts) {
  const { item, root, zoneSelector, itemSelector, onDrop } = opts;
  const rect = item.getBoundingClientRect();
  const originZone = item.parentElement;
  const originNext = nextItem(item, itemSelector, null);

  const placeholder = document.createElement(item.tagName);
  placeholder.className = "drag-placeholder";
  placeholder.style.height = rect.height + "px";
  item.parentElement.insertBefore(placeholder, item);

  const offsetY = e.clientY - rect.top;
  const saved = item.getAttribute("style") || "";
  Object.assign(item.style, {
    position: "fixed", left: rect.left + "px", top: rect.top + "px", width: rect.width + "px",
    zIndex: "60", pointerEvents: "none", margin: "0"
  });
  item.classList.add("is-dragging");
  document.body.classList.add("is-reordering");
  try { handle.setPointerCapture(e.pointerId); } catch (err) { /* not all pointers can be captured */ }

  let lastY = e.clientY;
  let frame = null;
  let done = false;

  function place(y) {
    const zones = Array.from(root.querySelectorAll(zoneSelector)).filter((z) => z.offsetParent !== null);
    let zone = null, best = Infinity;
    zones.forEach((z) => {
      const r = z.getBoundingClientRect();
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < best) { best = d; zone = z; }
    });
    if (!zone) return;
    const siblings = Array.from(zone.children).filter((el) => el !== item && el !== placeholder && el.matches(itemSelector));
    let before = null;
    for (const s of siblings) {
      const r = s.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = s; break; }
    }
    if (before) { if (placeholder.nextElementSibling !== before) zone.insertBefore(placeholder, before); }
    else if (siblings.length) {
      const last = siblings[siblings.length - 1];
      if (last.nextElementSibling !== placeholder) last.after(placeholder);
    } else if (placeholder.parentElement !== zone) {
      zone.appendChild(placeholder);
    }
  }

  function tick() {
    if (done) return;
    const h = window.innerHeight;
    let dy = 0;
    if (lastY < EDGE) dy = -Math.ceil(MAX_SCROLL * (1 - lastY / EDGE));
    else if (lastY > h - EDGE) dy = Math.ceil(MAX_SCROLL * (1 - (h - lastY) / EDGE));
    if (dy) { window.scrollBy(0, dy); place(lastY); }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  function onMove(ev) {
    lastY = ev.clientY;
    item.style.top = (ev.clientY - offsetY) + "px";
    place(ev.clientY);
  }

  function finish(commit) {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onEsc, true);
    const zone = placeholder.parentElement;
    const next = nextItem(placeholder, itemSelector, item);
    placeholder.remove();
    item.setAttribute("style", saved);
    item.classList.remove("is-dragging");
    document.body.classList.remove("is-reordering");
    if (!commit || !zone) return;
    const unchanged = zone === originZone && next === originNext;
    if (unchanged) return;
    onDrop({ zoneId: zone.dataset.zoneId || null, beforeId: next ? next.dataset.id || null : null });
  }
  function onUp() { finish(true); }
  function onCancel() { finish(false); }
  function onEsc(ev) { if (ev.key === "Escape") { ev.preventDefault(); finish(false); } }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onEsc, true);
}
