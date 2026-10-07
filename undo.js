// undo.js — a global Ctrl+Z / Cmd+Z that undoes the last local change (see
// the undo stack in store.js). It stays out of the way whenever focus is in
// a text field, so a browser's own native undo-while-typing still works
// there instead of being hijacked.

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["text", "email", "password", "search", "tel", "url", "number"].includes(type);
  }
  return !!el.isContentEditable;
}

export function initUndo(store) {
  document.addEventListener("keydown", (e) => {
    const key = e.key ? e.key.toLowerCase() : "";
    if (key !== "z") return;
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    if (isEditable(document.activeElement)) return;
    e.preventDefault();
    store.undo();
  });
}
