// Direct browser call to Google's Gemini API using the user's own key.
// The key travels in the x-goog-api-key header (Gemini's documented REST auth).
export async function ask(apiKey, model, prompt, opts) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + encodeURIComponent(model) + ":generateContent";

  const res = await fetch(url, {
    method: "POST",
    signal: opts && opts.signal,
    // In a header rather than the URL, so the key never sits in a URL
    // (browser history, logs, error messages).
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("Gemini API error (HTTP " + res.status + ")");
    throw new Error(msg);
  }

  const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  const part = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts[0] : null;
  const text = part && part.text ? part.text : "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return { text: text };
}

export const EXAMPLE_MODEL = "gemini-2.0-flash";
export const DOCS_URL = "https://ai.google.dev/gemini-api/docs/models";
