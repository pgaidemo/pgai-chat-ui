import type { Env } from "./types.js";

const MODEL = "claude-haiku-5-5";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export async function callModel(
  message: string,
  systemPrompt: string,
  env: Env
): Promise<{ text: string; ms: number }> {
  const start = Date.now();

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    }),
  });

  const ms = Date.now() - start;

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((b) => b.type === "text")?.text ?? "";

  return { text, ms };
}
