import { z } from "zod";
import { env, llmKey } from "./env";

export interface LLMRequest { system: string; user: string; maxTokens?: number }

const DEFAULT_MODEL = { gemini: "gemini-2.0-flash", openai: "gpt-4o-mini", anthropic: "claude-haiku-5-5" } as const;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function callText({ system, user, maxTokens = 3000 }: LLMRequest): Promise<string> {
  const e = env();
  const key = llmKey(e);
  if (!key) throw new Error(`No API key set for LLM_PROVIDER=${e.LLM_PROVIDER}`);
  const model = e.LLM_MODEL || DEFAULT_MODEL[e.LLM_PROVIDER];

  if (e.LLM_PROVIDER === "anthropic") {
    const j = await post("https://api.anthropic.com/v1/messages",
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
    return j.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  }
  if (e.LLM_PROVIDER === "openai") {
    const base = (e.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const j = await post(`${base}/chat/completions`, { authorization: `Bearer ${key}` }, {
      model, max_tokens: maxTokens, response_format: { type: "json_object" }, temperature: 0.1,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    return j.choices[0].message.content;
  }
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": key },
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.1 } });
  return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}

export function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

/** Calls the model and validates the reply against a Zod schema, retrying once with the error message. */
export async function generateJSON<T>(req: LLMRequest, schema: z.ZodType<T>): Promise<T> {
  let user = req.user;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callText({ ...req, user });
      return schema.parse(parseJsonLoose(text));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      user = `${req.user}\n\nYour previous reply was rejected: ${lastError.slice(0, 500)}\nReturn ONLY valid JSON that matches the requested shape.`;
    }
  }
  throw new Error(`Model output failed validation: ${lastError}`);
}
