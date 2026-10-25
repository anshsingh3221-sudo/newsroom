/**
 * Save as: src/components/TrueFalse.tsx  (new file)
 * Usage in a server page:  {q && <TrueFalse q={q} />}
 * Shows only the word TRUE or FALSE. Set SHOW_SOURCES to true to add small source links under it.
 */
import { headers } from "next/headers";
import { allowRequest } from "@/lib/ai/lookup";
import { trueFalse } from "@/lib/ai/trueFalse";

const SHOW_SOURCES = false;

export default async function TrueFalse({ q }: { q: string }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`truefalse:${ip}`)) {
    return <p className="ui text-sm text-muted" role="alert">Too many searches. Please wait a minute.</p>;
  }

  let result: Awaited<ReturnType<typeof trueFalse>>;
  try {
    result = await trueFalse(q);
  } catch (e) {
    console.error("true/false check failed", e);
    return <p className="ui text-sm text-muted" role="alert">Could not check this right now.</p>;
  }

  const color =
    result.answer === "TRUE" ? "text-green-700" : result.answer === "FALSE" ? "text-red-700" : "text-muted";

  return (
    <div className="mt-8" role="status" aria-live="polite">
      <p className={`text-7xl font-semibold tracking-tight ${color}`}>{result.answer}</p>
      {SHOW_SOURCES && result.sources.length > 0 && (
        <ul className="ui mt-4 space-y-1 text-sm">
          {result.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-navy underline">{s.title}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}