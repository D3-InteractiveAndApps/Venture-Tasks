// search.js — "search everything": finds tasks, grocery items, calendar
// events, sections, and pages across EVERY page at once (the per-list
// search box only ever looks at the page you're on). Pure, no DOM.
//
// Matching: case-insensitive, and every word you type has to appear
// somewhere in the item's text or client name — so "harbor logo" finds
// "Send logo files" tagged to client "Harbor Coffee". Open items rank
// above checked-off ones, and matches at the start of the text rank above
// matches in the middle.

function words(query) {
  return (query || "").toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesAll(haystack, ws) {
  const h = haystack.toLowerCase();
  return ws.every((w) => h.includes(w));
}

export function searchEverything(state, query, limit) {
  const ws = words(query);
  const max = limit || 60;
  if (!ws.length) return [];

  const pageOrder = {};
  const pageById = {};
  (state.pages || []).forEach((p) => { pageById[p.id] = p; pageOrder[p.id] = p.order || 0; });
  const sectionById = {};
  (state.sections || []).forEach((s) => { sectionById[s.id] = s; });

  const results = [];

  (state.pages || []).forEach((p) => {
    if (matchesAll(p.name || "", ws)) results.push({ kind: "page", page: p, rank: 0 });
  });

  (state.sections || []).forEach((s) => {
    const page = pageById[s.pageId];
    if (!page || page.type === "calendar") return; // a calendar's one implicit section isn't user-facing
    if (matchesAll(s.name || "", ws)) results.push({ kind: "section", page, section: s, rank: 1 });
  });

  const first = ws[0];
  (state.tasks || []).forEach((t) => {
    const page = pageById[t.pageId];
    if (!page) return;
    const text = t.text || "";
    if (!matchesAll(text + " " + (t.client || "") + " " + (t.note || ""), ws)) return;
    const startsWith = text.toLowerCase().startsWith(first);
    // Lower rank sorts first: open before done, prefix matches before mid-text.
    const rank = 2 + (t.done ? 2 : 0) + (startsWith ? 0 : 1);
    results.push({ kind: "task", page, section: sectionById[t.sectionId] || null, task: t, rank });
  });

  results.sort((a, b) =>
    a.rank - b.rank
    || (pageOrder[a.page.id] || 0) - (pageOrder[b.page.id] || 0)
    || ((a.task && a.task.text) || (a.section && a.section.name) || a.page.name || "").localeCompare((b.task && b.task.text) || (b.section && b.section.name) || b.page.name || "")
  );
  return results.slice(0, max);
}

// Splits `text` into [{ text, hit }] runs so the UI can wrap matched words
// in <mark> without ever touching innerHTML.
export function highlightRuns(text, query) {
  const ws = words(query);
  const src = text || "";
  if (!ws.length || !src) return [{ text: src, hit: false }];
  const lower = src.toLowerCase();
  const marks = new Array(src.length).fill(false);
  ws.forEach((w) => {
    let i = lower.indexOf(w);
    while (i !== -1) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
      i = lower.indexOf(w, i + w.length);
    }
  });
  const runs = [];
  let cur = { text: "", hit: marks[0] };
  for (let i = 0; i < src.length; i++) {
    if (marks[i] !== cur.hit) { runs.push(cur); cur = { text: "", hit: marks[i] }; }
    cur.text += src[i];
  }
  runs.push(cur);
  return runs.filter((r) => r.text);
}
