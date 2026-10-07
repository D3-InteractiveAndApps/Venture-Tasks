// Direct browser call to Anthropic's Messages API using the user's own key.
// Anthropic requires this header to allow a direct browser (CORS) request —
// without it the API refuses calls made straight from a web page.
export async function ask(apiKey, model, prompt, opts) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: opts && opts.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("Claude API error (HTTP " + res.status + ")");
    throw new Error(msg);
  }

  const block = data && Array.isArray(data.content) ? data.content.find((b) => b.type === "text") : null;
  const text = block && block.text ? block.text : "";
  if (!text) throw new Error("Claude returned an empty response.");
  return { text: text };
}

export const EXAMPLE_MODEL = "claude-sonnet-4-5";
export const DOCS_URL = "https://docs.claude.com/en/docs/about-claude/models";
