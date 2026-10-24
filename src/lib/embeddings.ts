import { env } from "./env";

export const EMBEDDING_DIMS = 768;
export const embeddingsConfigured = () => {
  const e = env();
  return e.EMBEDDING_PROVIDER === "gemini" ? !!e.GEMINI_API_KEY : e.EMBEDDING_PROVIDER === "openai" ? !!e.OPENAI_API_KEY : false;
};

/** Returns a 768-dim vector, or null when embeddings are not configured (keyword search still works). */
export async function embedText(text: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  const e = env();
  const input = text.slice(0, 6000);
  if (e.EMBEDDING_PROVIDER === "gemini") {
    const model = e.EMBEDDING_MODEL || "gemini-embedding-001";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": e.GEMINI_API_KEY! },
      body: JSON.stringify({ content: { parts: [{ text: input }] }, outputDimensionality: EMBEDDING_DIMS }),
    });
    if (!res.ok) throw new Error(`Embedding failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return (await res.json()).embedding.values;
  }
  const base = (e.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/embeddings`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${e.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: e.EMBEDDING_MODEL || "text-embedding-3-small", input, dimensions: EMBEDDING_DIMS }),
  });
  if (!res.ok) throw new Error(`Embedding failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data[0].embedding;
}

export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
