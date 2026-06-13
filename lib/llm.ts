// Provider-agnostic LLM client (OpenAI-compatible chat completions).
//
// Defaults to xAI / Grok (the sponsor). Works with any OpenAI-compatible API
// by changing env vars — e.g. Groq, or Vercel AI Gateway.
//   LLM_API_KEY   - your key (xAI)            [required for live mode]
//   LLM_BASE_URL  - default https://api.x.ai/v1
//   LLM_MODEL     - default grok-3
//
// If LLM_API_KEY is unset, chat() returns null and every caller falls back to
// deterministic text. That keeps the whole demo runnable with ZERO keys.

export interface ChatOpts {
  system?: string;
  prompt: string;
  temperature?: number;
}

export async function chat(opts: ChatOpts): Promise<string | null> {
  const key = process.env.LLM_API_KEY;
  if (!key) return null; // mock mode — callers use their deterministic fallback

  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.x.ai/v1";
  const model = process.env.LLM_MODEL ?? "grok-3";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.7,
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: opts.prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? null;
  } catch {
    return null; // network/parse error → graceful fallback, never crash the demo
  }
}
