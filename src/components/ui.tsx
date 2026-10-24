import Link from "next/link";
import { VERDICTS } from "@/lib/verdicts";

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = VERDICTS[verdict] ?? VERDICTS.unverified;
  return <span className="ui inline-block rounded-sm px-2 py-0.5 text-xs font-semibold" style={{ color: v.color, background: v.bg }}>{v.label}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-rule p-6">
      <p className="font-semibold">{title}</p>
      {children && <div className="ui mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Renders text containing [S1]-style markers as links to the real sources. */
export function Cited({ text, sources }: { text: string; sources: { id: string; url: string; title: string }[] }) {
  const parts = text.split(/(\[S\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const id = p.match(/^\[(S\d+)\]$/)?.[1];
        const src = id ? sources.find((s) => s.id === id) : null;
        return src ? (
          <sup key={i}><a href={src.url} target="_blank" rel="noopener noreferrer" title={src.title} className="ui px-0.5 text-navy underline">{id!.slice(1)}</a></sup>
        ) : <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function CiteIds({ ids, sources }: { ids: string[]; sources: { id: string; url: string; title: string }[] }) {
  return <Cited text={ids.map((i) => `[${i}]`).join("")} sources={sources} />;
}

export function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-2">
      <h2 className="text-2xl">{children}</h2>
      {href && <Link href={href} className="ui text-sm text-navy underline">See all</Link>}
    </div>
  );
}

export function StatementCard({ s }: { s: Record<string, any> }) {
  return (
    <article className="border-l-2 border-navy pl-4">
      <p className="ui text-sm font-semibold"><Link href={`/people/${s.people?.slug}`} className="hover:underline">{s.people?.name}</Link></p>
      <blockquote className="mt-1">“{s.text}”{s.is_excerpt && <span className="ui ml-1 text-xs text-muted">(excerpt)</span>}</blockquote>
      <dl className="ui mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-4">
        <div><dt className="font-medium text-ink">Said on</dt><dd>{s.made_on ? new Date(s.made_on).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" }) : "Date unknown"}</dd></div>
        <div><dt className="font-medium text-ink">Source type</dt><dd>{String(s.source_type).replace("_", " ")}</dd></div>
        <div><dt className="font-medium text-ink">Language</dt><dd>{s.language}</dd></div>
        {s.transcript_timestamp_seconds != null && <div><dt className="font-medium text-ink">Timestamp</dt><dd>{Math.floor(s.transcript_timestamp_seconds / 60)}:{String(s.transcript_timestamp_seconds % 60).padStart(2, "0")}</dd></div>}
        {s.published_on && <div><dt className="font-medium text-ink">Published</dt><dd>{s.published_on}</dd></div>}
      </dl>
      {s.context && <p className="ui mt-2 text-sm text-muted">Context: {s.context}</p>}
      <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="ui mt-1 inline-block text-sm text-navy underline">Original source</a>
    </article>
  );
}
