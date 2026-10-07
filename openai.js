// Direct browser call to OpenAI's Chat Completions API using the user's own key.
export async function ask(apiKey, model, prompt, opts) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: opts && opts.signal,
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("OpenAI API error (HTTP " + res.status + ")");
    throw new Error(msg);
  }

  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  const text = choice && choice.message && choice.message.content ? choice.message.content : "";
  if (!text) throw new Error("OpenAI returned an empty response.");
  return { text: text };
}

export const EXAMPLE_MODEL = "gpt-4o-mini";
export const DOCS_URL = "https://platform.openai.com/docs/models";
