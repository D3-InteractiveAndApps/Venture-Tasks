// ics.js — builds a small .ics (iCalendar) file out of the app's current due
// dates, for a one-time import into an external calendar app (Apple/Google/
// Outlook). Pure string-building — no DOM, no network, no dependency on the
// store's shape beyond plain arrays — so it's easy to unit test on its own.
//
// This is a *snapshot*, not a live feed: there's no server here to host a
// webcal:// subscription URL that updates itself, so re-export and re-import
// whenever you want a calendar app to catch up. See README.md for the
// reasoning.

function pad2(n) { return (n < 10 ? "0" : "") + n; }

// YYYYMMDDTHHMMSSZ, UTC — used for DTSTAMP (when this file was generated).
function icsTimestamp(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
    + "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
}

// "2026-12-01" -> "20261201", for an all-day VALUE=DATE event.
function icsDateOnly(dueStr) {
  return (dueStr || "").replace(/-/g, "");
}

// A due date with no time (the common case, and the only case outside
// calendar pages) is an all-day VALUE=DATE event. A calendar page's event
// CAN also carry an optional "HH:MM" eventTime (see family-calendar-
// schema.sql) — when it does, this builds a floating (no-timezone)
// local date+time instead, same philosophy as dueDate/eventTime
// themselves: no time zone math, just what the person typed, left for
// the calendar app to interpret in whichever zone it's already in.
function icsLocalDateTime(dueStr, timeStr) {
  const parts = (timeStr || "").split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const d = new Date((dueStr || "") + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}

function fmtIcsLocal(d) {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
    + "T" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

// Escapes text per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline) —
// order matters, the backslash escape has to go first.
function escapeText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545 caps a content line at 75 octets, continued on the next line with
// a leading space. Most calendar apps are forgiving of long lines, but
// folding is cheap and keeps this well-formed for the strict ones.
function foldLine(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    out += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

// Builds the full .ics text. Only open (not done) tasks with a due date on a
// to-do page are included — grocery items never have due dates, and a done
// task isn't "due" anymore in any way a calendar app should remind you of.
export function buildIcsCalendar(pages, sections, tasks) {
  const pageById = {};
  (pages || []).forEach((p) => { pageById[p.id] = p; });
  const sectionById = {};
  (sections || []).forEach((s) => { sectionById[s.id] = s; });

  const stamp = icsTimestamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Venture Tasks//Due Dates Export//EN",
    "CALSCALE:GREGORIAN"
  ];

  (tasks || [])
    .filter((t) => t && !t.done && t.dueDate)
    .filter((t) => {
      const page = pageById[t.pageId];
      return page && page.type !== "grocery";
    })
    .forEach((t) => {
      const page = pageById[t.pageId];
      const section = sectionById[t.sectionId];
      const descParts = [];
      if (page) descParts.push("Page: " + page.name);
      if (section) descParts.push("Section: " + section.name);
      if (t.client) descParts.push("Client: " + t.client);
      if (t.value) descParts.push("Value: $" + t.value);

      lines.push("BEGIN:VEVENT");
      lines.push(foldLine("UID:" + t.id + "@venture-tasks"));
      lines.push("DTSTAMP:" + stamp);
      if (t.eventTime) {
        const start = icsLocalDateTime(t.dueDate, t.eventTime);
        const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1hr duration — there's no end time to go on
        lines.push("DTSTART:" + fmtIcsLocal(start));
        lines.push("DTEND:" + fmtIcsLocal(end));
      } else {
        lines.push("DTSTART;VALUE=DATE:" + icsDateOnly(t.dueDate));
      }
      lines.push(foldLine("SUMMARY:" + escapeText(t.text || "Untitled task")));
      if (descParts.length) lines.push(foldLine("DESCRIPTION:" + escapeText(descParts.join(" · "))));
      lines.push("END:VEVENT");
    });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
