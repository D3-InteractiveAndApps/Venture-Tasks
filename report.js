// report.js — the client work report: every task tagged with a client
// and/or a value, filtered by client, period, and status, as a CSV you can
// open in Excel / Google Sheets / Numbers for an invoice or a quarterly tax
// estimate. Pure (no DOM), so it's unit tested on its own.
//
// Which date a task "belongs" to: when it was completed if it's done (that's
// when the work was delivered/billable), otherwise its due date, otherwise
// when it was created.

import { fmtDate } from "./dates.js";

export const NO_CLIENT = "__none__";

function dateOnly(iso) { return iso ? String(iso).slice(0, 10) : ""; }

export function reportDate(t) {
  if (t.done && t.completedAt) return dateOnly(t.completedAt);
  return t.dueDate || dateOnly(t.createdAt) || "";
}

// Distinct client names across every task, case-insensitively merged
// ("harbor coffee" and "Harbor Coffee" are one client), alphabetized.
export function listClients(state) {
  const seen = {};
  (state.tasks || []).forEach((t) => {
    const name = (t.client || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen[key]) seen[key] = name;
  });
  return Object.values(seen).sort((a, b) => a.localeCompare(b));
}

// { from, to } as YYYY-MM-DD (inclusive), or nulls for "all time".
export function periodRange(period, now) {
  const d = now ? new Date(now) : new Date();
  const y = d.getFullYear(), m = d.getMonth();
  const range = (a, b) => ({ from: fmtDate(a), to: fmtDate(b) });
  const q = Math.floor(m / 3);
  switch (period) {
    case "this-month": return range(new Date(y, m, 1), new Date(y, m + 1, 0));
    case "last-month": return range(new Date(y, m - 1, 1), new Date(y, m, 0));
    case "this-quarter": return range(new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 0));
    case "last-quarter": return range(new Date(y, q * 3 - 3, 1), new Date(y, q * 3, 0));
    case "this-year": return range(new Date(y, 0, 1), new Date(y, 11, 31));
    case "last-year": return range(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
    default: return { from: null, to: null };
  }
}

// opts: { client: "" (all) | NO_CLIENT | a name, from, to, status: "done"|"open"|"all" }
export function selectReportRows(state, opts) {
  const o = opts || {};
  const pageById = {};
  (state.pages || []).forEach((p) => { pageById[p.id] = p; });
  const sectionById = {};
  (state.sections || []).forEach((s) => { sectionById[s.id] = s; });
  const wantClient = (o.client || "").toLowerCase();

  return (state.tasks || [])
    .filter((t) => {
      const page = pageById[t.pageId];
      if (!page || page.type === "grocery") return false;
      const client = (t.client || "").trim();
      const value = Number(t.value) > 0;
      if (!client && !value) return false;
      if (o.client === NO_CLIENT) { if (client) return false; }
      else if (wantClient && client.toLowerCase() !== wantClient) return false;
      if (o.status === "done" && !t.done) return false;
      if (o.status === "open" && t.done) return false;
      const d = reportDate(t);
      if (o.from && (!d || d < o.from)) return false;
      if (o.to && (!d || d > o.to)) return false;
      return true;
    })
    .map((t) => ({ task: t, page: pageById[t.pageId], section: sectionById[t.sectionId] || null, date: reportDate(t) }))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.task.client || "").localeCompare(b.task.client || ""));
}

// Spreadsheet-safe CSV cell. Quotes anything with a comma, quote, or line
// break, and defuses text that a spreadsheet would otherwise run as a
// formula (a task named "=HYPERLINK(...)" shouldn't execute on open).
function cell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildClientReportCsv(rows, currency) {
  const code = currency || "USD";
  const header = ["Date", "Status", "Client", "Task", "Value", "Currency", "Page", "Section", "Due date", "Completed"];
  const lines = [header.map(cell).join(",")];
  let total = 0;
  rows.forEach((r) => {
    const t = r.task;
    const value = Number(t.value) > 0 ? Math.round(Number(t.value) * 100) / 100 : null;
    if (value) total += value;
    lines.push([
      r.date,
      t.done ? "Done" : "Open",
      (t.client || "").trim(),
      t.text || "",
      value === null ? "" : Number(value.toFixed(2)),
      value === null ? "" : code,
      r.page ? r.page.name || "" : "",
      r.section ? r.section.name || "" : "",
      t.dueDate || "",
      t.done && t.completedAt ? dateOnly(t.completedAt) : ""
    ].map(cell).join(","));
  });
  total = Math.round(total * 100) / 100;
  lines.push("");
  lines.push(["Total", "", "", rows.length + " task" + (rows.length === 1 ? "" : "s"), Number(total.toFixed(2)), code, "", "", "", ""].map(cell).join(","));
  // Leading BOM so Excel reads non-English characters (é, ñ, €) correctly.
  return { csv: "﻿" + lines.join("\r\n") + "\r\n", total, count: rows.length };
}
