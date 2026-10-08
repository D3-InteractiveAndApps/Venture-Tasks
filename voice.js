// voice.js — hands-free voice commands, built on the browser's native Web
// Speech API (no server, no API key — it's built into Chrome/Edge/Safari;
// Firefox doesn't implement it, and isSupported() reports that).
//
// Two independent halves live in this one small file:
//   - listenOnce(): the actual microphone/recognition wrapper. Browser-only.
//   - parseCommand() / findBestMatch(): pure string functions that turn a
//     spoken phrase into an action, and fuzzy-match it against whatever's
//     currently on the active page. No DOM, no browser APIs — these could
//     run in Node, which is what makes them easy to unit test.

export function isSupported() {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Starts ONE listening session — it stops itself after a single spoken
// phrase (or a pause), rather than listening continuously, so a misfire
// can't silently keep listening in the background. Calls onResult OR
// onError (never both), then always calls onEnd.
export function listenOnce({ onResult, onError, onEnd }) {
  const Ctor = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!Ctor) {
    if (onError) onError("Voice commands aren't supported in this browser — try Chrome, Edge, or Safari.");
    if (onEnd) onEnd();
    return null;
  }

  const recognizer = new Ctor();
  recognizer.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  recognizer.continuous = false;
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  const ERROR_MESSAGES = {
    "not-allowed": "Microphone access was blocked — allow it in your browser's site settings to use voice commands.",
    "no-speech": "Didn't hear anything — try again.",
    "audio-capture": "No microphone found on this device.",
    network: "Voice recognition needs a network connection."
  };

  recognizer.onresult = (e) => {
    const transcript = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
    if (onResult) onResult(transcript);
  };
  recognizer.onerror = (e) => {
    if (onError) onError(ERROR_MESSAGES[e.error] || ("Voice input error: " + e.error));
  };
  recognizer.onend = () => { if (onEnd) onEnd(); };

  try {
    recognizer.start();
  } catch (e) {
    if (onError) onError("Couldn't start voice input.");
    if (onEnd) onEnd();
  }
  return recognizer;
}

// ---- command parsing & fuzzy matching (pure — no browser APIs) ----

const STOPWORDS = new Set(["the", "a", "an", "please", "some", "my", "item", "task", "to"]);

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ");
}

// 1.0 exact match, 0.85 one contains the other, otherwise a fraction based
// on how many of the spoken words actually appear in the candidate — good
// enough for "milk" to find a task named "2% milk", or "check off bananas"
// to find "Bananas" even with a filler word thrown in.
function matchScore(candidate, spoken) {
  const a = normalize(candidate);
  const b = normalize(spoken);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const aTokens = new Set(a.split(" "));
  const bTokens = b.split(" ").filter(Boolean);
  if (!bTokens.length) return 0;
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return (overlap / bTokens.length) * 0.7;
}

const MIN_MATCH_SCORE = 0.4;

// Finds the best-scoring entry in `items` (comparing `item[key]` to
// `spoken`). Returns { item, score } or null if nothing clears the
// threshold — callers should treat null as "ask the user to try again"
// rather than guessing at a low-confidence match.
export function findBestMatch(items, spoken, key) {
  let best = null;
  for (const item of items) {
    const score = matchScore(item[key], spoken);
    if (score >= MIN_MATCH_SCORE && (!best || score > best.score)) best = { item, score };
  }
  return best;
}

// Order matters: "mark X not done" ends in the word "done", so the
// uncheck patterns must be tried before the check patterns, or "mark milk
// not done" would wrongly match the check pattern with target "milk not".
const UNCHECK_PATTERNS = [
  /^(?:please\s+)?(?:uncheck|unmark)\s+(.+)$/i,
  /^(?:please\s+)?mark\s+(.+?)\s+(?:as\s+)?(?:not done|undone)$/i
];
const CHECK_PATTERNS = [
  /^(?:please\s+)?(?:check off|check|complete|finish)\s+(.+)$/i,
  /^(?:please\s+)?mark\s+(.+?)\s+(?:as\s+)?done$/i
];
const ADD_PATTERNS = [
  /^(?:please\s+)?(?:add|put)\s+(.+?)(?:\s+(?:to|in|under)\s+(.+))?$/i
];

// Turns a raw spoken transcript into { type: "add"|"check"|"uncheck", ... }
// or { type: "unrecognized", raw } / { type: "empty" }. Never touches the
// app's data — callers do the actual lookup/mutation with findBestMatch and
// the store.
export function parseCommand(transcriptRaw) {
  const transcript = (transcriptRaw || "").trim();
  if (!transcript) return { type: "empty" };

  for (const re of UNCHECK_PATTERNS) {
    const m = transcript.match(re);
    if (m) return { type: "uncheck", target: m[1].trim() };
  }
  for (const re of CHECK_PATTERNS) {
    const m = transcript.match(re);
    if (m) return { type: "check", target: m[1].trim() };
  }
  for (const re of ADD_PATTERNS) {
    const m = transcript.match(re);
    if (m) return { type: "add", text: m[1].trim(), section: m[2] ? m[2].trim() : null };
  }
  return { type: "unrecognized", raw: transcript };
}
